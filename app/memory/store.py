"""
MemoryStore — Low-Level Persistence Layer

Handles the actual disk I/O for the DeV memory system.

Responsibilities:
- Atomic JSON file writes (project memory, preferences)
- Append-only JSONL files (fixes, patterns — audit trail)
- JSONL compaction to prevent unbounded growth
- File integrity checks and safe fallback reads
- Export / import helpers

Design:
- All writes are atomic: write to tmp then rename.
- JSONL files grow append-only; compaction collapses duplicates.
- No external dependencies (stdlib only).
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from app.utils.logger import setup_logger


logger = setup_logger(__name__)


class MemoryStore:
    """
    Low-level persistence helper for the DeV memory system.

    The memory directory layout::

        .dev_memory/
        ├── project_memory.json    ← latest project knowledge (overwritten)
        ├── preferences.json       ← engineering preferences (overwritten)
        ├── session.json           ← current session state (overwritten)
        ├── fixes.jsonl            ← append-only fix audit trail
        ├── patterns.jsonl         ← append-only pattern audit trail
        └── index.json             ← retrieval index (rebuilt on each write)
    """

    def __init__(self, memory_dir: Path) -> None:
        self.memory_dir = Path(memory_dir)
        self.memory_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Atomic JSON helpers (used for single-document files)
    # ------------------------------------------------------------------

    def write_json(self, filename: str, data: Dict[str, Any]) -> bool:
        """
        Atomically write *data* to *filename* inside the memory directory.

        Uses a sibling temp file + rename to avoid partial writes.
        """
        target = self.memory_dir / filename
        try:
            # Write to a temp file in the same directory (same filesystem → rename is atomic)
            fd, tmp_path = tempfile.mkstemp(dir=self.memory_dir, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            except Exception:
                os.unlink(tmp_path)
                raise
            os.replace(tmp_path, target)  # atomic on POSIX
            logger.debug(f"Wrote {target.name} ({os.path.getsize(target):,} bytes)")
            return True
        except Exception as exc:
            logger.error(f"Failed to write {filename}: {exc}")
            return False

    def read_json(self, filename: str) -> Optional[Dict[str, Any]]:
        """Read and parse a JSON file. Returns None if missing or corrupt."""
        target = self.memory_dir / filename
        if not target.exists():
            return None
        try:
            with open(target, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as exc:
            logger.error(f"Corrupt JSON in {filename}: {exc} — skipping")
            return None
        except Exception as exc:
            logger.error(f"Failed to read {filename}: {exc}")
            return None

    def delete_file(self, filename: str) -> bool:
        """Delete a file from the memory directory."""
        target = self.memory_dir / filename
        try:
            if target.exists():
                target.unlink()
                logger.debug(f"Deleted {filename}")
            return True
        except Exception as exc:
            logger.error(f"Failed to delete {filename}: {exc}")
            return False

    # ------------------------------------------------------------------
    # JSONL helpers (append-only audit trail)
    # ------------------------------------------------------------------

    def append_jsonl(self, filename: str, record: Dict[str, Any]) -> bool:
        """Append a single JSON record to an append-only JSONL file."""
        target = self.memory_dir / filename
        try:
            with open(target, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
            return True
        except Exception as exc:
            logger.error(f"Failed to append to {filename}: {exc}")
            return False

    def read_jsonl(self, filename: str) -> List[Dict[str, Any]]:
        """
        Read all records from a JSONL file.

        Silently skips blank lines and corrupt records (logs a warning
        so production operators can detect storage issues).
        """
        target = self.memory_dir / filename
        records: List[Dict[str, Any]] = []
        if not target.exists():
            return records
        try:
            with open(target, "r", encoding="utf-8") as f:
                for lineno, raw in enumerate(f, 1):
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        records.append(json.loads(raw))
                    except json.JSONDecodeError as exc:
                        logger.warning(f"{filename}:{lineno} — corrupt record, skipping: {exc}")
        except Exception as exc:
            logger.error(f"Failed to read {filename}: {exc}")
        return records

    def rewrite_jsonl(self, filename: str, records: List[Dict[str, Any]]) -> bool:
        """
        Overwrite the entire JSONL file with *records*.

        Used during compaction / deduplication. Atomic via temp-file rename.
        """
        target = self.memory_dir / filename
        try:
            fd, tmp_path = tempfile.mkstemp(dir=self.memory_dir, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    for record in records:
                        f.write(json.dumps(record, ensure_ascii=False) + "\n")
            except Exception:
                os.unlink(tmp_path)
                raise
            os.replace(tmp_path, target)
            logger.debug(f"Compacted {filename} → {len(records)} records")
            return True
        except Exception as exc:
            logger.error(f"Failed to rewrite {filename}: {exc}")
            return False

    def iter_jsonl(self, filename: str) -> Generator[Dict[str, Any], None, None]:
        """Yield records from a JSONL file one at a time (memory-efficient)."""
        for record in self.read_jsonl(filename):
            yield record

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def file_exists(self, filename: str) -> bool:
        return (self.memory_dir / filename).exists()

    def memory_size_bytes(self) -> int:
        """Total size of all files in the memory directory."""
        total = 0
        for path in self.memory_dir.iterdir():
            if path.is_file():
                total += path.stat().st_size
        return total

    def list_files(self) -> List[str]:
        """Return names of all files in the memory directory."""
        return [p.name for p in self.memory_dir.iterdir() if p.is_file()]
