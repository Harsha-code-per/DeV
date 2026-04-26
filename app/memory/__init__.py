"""
DeV Memory Sub-Package

Provides the storage, retrieval and embedding layers for the
Persistent Project Memory System.

The main MemoryEngine lives in app/core/memory_engine.py.
This package provides the underlying infrastructure:

- store.py     → MemoryStore: low-level JSON + JSONL persistence helpers
- retrieval.py → MemoryRetriever: keyword/tag-based ranking and retrieval logic
- embeddings.py→ (future) lightweight vector similarity for semantic search
"""

from app.memory.store import MemoryStore
from app.memory.retrieval import MemoryRetriever

__all__ = ["MemoryStore", "MemoryRetriever"]
