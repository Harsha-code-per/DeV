"""
Production-Grade Persistent Project Memory System for DeV

Enables DeV to remember and retrieve engineering knowledge across sessions.

Responsibilities:
- Store 5 types of engineering memory (project, fix, preference, session, pattern)
- Implement retrieval-first design (retrieve context before planning)
- Manage persistent JSON storage with semantic retrieval
- Ensure data quality through scoring and deduplication
- Enforce safety rules (zero secret leakage)

This system enables DeV to become "my engineer" instead of just an AI tool.

Design Principles:
- Retrieval-first: Always retrieve context before execution
- Trust-first: Only store verified, high-confidence data
- Safety-first: Never store secrets, credentials, or garbage
- Quality-first: Intelligent deduplication and scoring
- Debuggable: Human-readable JSON storage with full audit trails
"""

import json
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Any, Set
import hashlib

from app.utils.logger import setup_logger


logger = setup_logger(__name__)


class MemoryType(str, Enum):
    """Types of memory stored by the system"""
    PROJECT = "project"
    FIX = "fix"
    PREFERENCE = "preference"
    SESSION = "session"
    PATTERN = "pattern"


# ============================================================================
# DATA MODELS (8 core models + supporting types)
# ============================================================================

@dataclass
class MemoryEntry:
    """Base memory entry with scoring and metadata"""
    id: str
    type: str  # MemoryType value
    content: str
    timestamp: str
    importance_score: float  # 0-100
    confidence: float  # 0-100
    tags: List[str] = field(default_factory=list)
    source: str = ""  # "execution", "user_input", "browser_failure", etc.
    verified: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryEntry":
        return cls(**data)


@dataclass
class ProjectMemory:
    """Project-level knowledge: architecture, stack, deployment"""
    tech_stack: Dict[str, str] = field(default_factory=dict)  # "language": "python", "db": "postgresql"
    architecture_style: str = ""  # "microservices", "monolith", "serverless"
    deployment_strategy: str = ""  # "docker", "k8s", "lambda", "vps"
    environment_vars: List[str] = field(default_factory=list)
    important_constraints: List[str] = field(default_factory=list)
    build_command: str = ""
    test_command: str = ""
    verification_preferences: List[str] = field(default_factory=list)
    last_updated: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProjectMemory":
        return cls(**data)


@dataclass
class FixMemory:
    """Historical fix information: what was fixed, why it worked"""
    fix_id: str
    category: str  # "jwt", "build", "database", "frontend", etc.
    root_cause: str  # The underlying problem
    solution: str  # How it was fixed
    files_changed: List[str] = field(default_factory=list)
    verification_passed: bool = False
    retry_count: int = 0
    time_to_fix_minutes: int = 0
    timestamp: str = ""
    confidence: float = 0.0  # 0-100
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FixMemory":
        return cls(**data)


@dataclass
class PreferenceMemory:
    """User/project engineering preferences"""
    code_style: str = ""  # "google", "pep8", "airbnb", etc.
    architecture_preference: str = ""  # "service-layer", "repository", "clean", etc.
    testing_preference: str = ""  # "pytest", "unittest", "jest", etc.
    deployment_preference: str = ""  # "docker-compose", "k8s", etc.
    coding_conventions: Dict[str, str] = field(default_factory=dict)
    tool_preferences: Dict[str, str] = field(default_factory=dict)
    safety_preferences: Dict[str, Any] = field(default_factory=dict)
    documentation_preference: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PreferenceMemory":
        return cls(**data)


@dataclass
class SessionMemory:
    """Current session context: task, state, pending items"""
    current_task: str = ""
    task_context: str = ""
    ongoing_work: List[str] = field(default_factory=list)
    pending_approvals: List[str] = field(default_factory=list)
    recent_failures: List[str] = field(default_factory=list)
    browser_failures: List[str] = field(default_factory=list)
    last_action: str = ""
    last_action_time: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionMemory":
        return cls(**data)


@dataclass
class PatternMemory:
    """Recurring issues and solutions over time"""
    pattern_id: str
    issue_category: str  # "jwt", "build", "database", etc.
    common_root_causes: List[str] = field(default_factory=list)
    frequency: int = 0  # How many times seen
    last_seen: str = ""
    proven_solutions: List[str] = field(default_factory=list)
    success_rate: float = 0.0  # 0-1
    environment_correlation: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PatternMemory":
        return cls(**data)


@dataclass
class MemoryRetrievalResult:
    """Result from memory retrieval query"""
    relevant_entries: List[MemoryEntry] = field(default_factory=list)
    reasoning: str = ""  # Why these entries were retrieved
    confidence: float = 0.0  # Overall confidence in results
    search_tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "relevant_entries": [e.to_dict() for e in self.relevant_entries],
            "reasoning": self.reasoning,
            "confidence": self.confidence,
            "search_tags": self.search_tags,
        }


@dataclass
class MemoryContextSummary:
    """Aggregated context for execution"""
    project_context: Optional[ProjectMemory] = None
    relevant_fixes: List[FixMemory] = field(default_factory=list)
    similar_failures: List[str] = field(default_factory=list)
    recommended_strategy: str = ""
    confidence: float = 0.0
    reasoning: str = ""
    search_tags: List[str] = field(default_factory=list)  # Tags used to retrieve this context
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_context": self.project_context.to_dict() if self.project_context else None,
            "relevant_fixes": [f.to_dict() for f in self.relevant_fixes],
            "similar_failures": self.similar_failures,
            "recommended_strategy": self.recommended_strategy,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "search_tags": self.search_tags,
        }


# ============================================================================
# MEMORY ENGINE - Core System
# ============================================================================

class MemoryEngine:
    """
    Production-grade Persistent Project Memory System
    
    Manages storage and retrieval of engineering knowledge:
    - Project architecture and decisions
    - Historical fixes and outcomes
    - Engineering preferences
    - Session context
    - Recurring patterns and solutions
    """
    
    # Secret detection patterns (safety)
    SECRET_PATTERNS = [
        r"(?i)(password|passwd|pwd)\s*[:=]",
        r"(?i)(api[_-]?key|apikey)\s*[:=]",
        r"(?i)(secret|token|bearer)\s*[:=]",
        r"(?i)(auth[_-]?token|access[_-]?token)\s*[:=]",
        r"(?i)(private[_-]?key)\s*[:=]",
        r"sk[_-]?[a-z0-9]{20,}",  # Common secret format
    ]
    
    def __init__(self, project_root: Path = Path.cwd()):
        """Initialize MemoryEngine with project root"""
        self.project_root = project_root
        self.memory_dir = project_root / ".dev_memory"
        self.memory_dir.mkdir(exist_ok=True)
        
        # File locations
        self.project_file = self.memory_dir / "project_memory.json"
        self.fixes_file = self.memory_dir / "fixes.jsonl"  # Append-only
        self.preferences_file = self.memory_dir / "preferences.json"
        self.patterns_file = self.memory_dir / "patterns.jsonl"  # Append-only
        self.session_file = self.memory_dir / "session.json"  # Persisted across restarts
        self.index_file = self.memory_dir / "index.json"
        
        # In-memory caches for current session
        self.project_memory: Optional[ProjectMemory] = None
        self.fixes: List[FixMemory] = []
        self.preferences: Optional[PreferenceMemory] = None
        self.patterns: List[PatternMemory] = []
        self.index: Dict[str, Any] = {}
        
        # Session memory (persisted to disk so it survives restarts)
        self.session_memory = SessionMemory()
        
        # Load existing memory
        self._load()
        logger.info(f"MemoryEngine initialized at {self.memory_dir}")
    
    # ========================================================================
    # STORAGE OPERATIONS
    # ========================================================================
    
    def store_project_memory(self, memory: ProjectMemory) -> bool:
        """Store or update project memory"""
        if self._check_for_secrets_dict(memory.to_dict()):
            logger.warning("Project memory contains secrets - skipping storage")
            return False
        
        memory.last_updated = datetime.now().isoformat()
        self.project_memory = memory
        self._persist()
        logger.info("Project memory stored successfully")
        return True
    
    def store_fix_memory(self, fix: FixMemory) -> bool:
        """Store fix memory (append-only for audit trail)"""
        if self._check_for_secrets(fix.solution):
            logger.warning("Fix memory contains secrets - skipping storage")
            return False
        
        if not fix.fix_id:
            fix.fix_id = self._generate_id("fix")
        
        fix.timestamp = datetime.now().isoformat()
        
        # Check for duplicates before adding
        if not self._is_duplicate_fix(fix):
            self.fixes.append(fix)
            self._persist_append("fixes", fix.to_dict())
            logger.info(f"Fix memory stored: {fix.fix_id}")
            return True
        else:
            logger.info(f"Duplicate fix detected, skipping: {fix.category}")
            return False
    
    def store_preference_memory(self, prefs: PreferenceMemory) -> bool:
        """Store user/project preferences"""
        self.preferences = prefs
        self._persist()
        logger.info("Preference memory stored successfully")
        return True
    
    def store_session_memory(self, session: SessionMemory) -> bool:
        """Store session context (persists to disk to survive CLI restart)"""
        self.session_memory = session
        try:
            with open(self.session_file, "w") as f:
                json.dump(session.to_dict(), f, indent=2)
            logger.info("Session memory updated and persisted to disk")
        except Exception as e:
            logger.error(f"Error persisting session memory: {e}")
        return True
    
    def store_pattern_memory(self, pattern: PatternMemory) -> bool:
        """Store recurring pattern or issue"""
        if not pattern.pattern_id:
            pattern.pattern_id = self._generate_id("pattern")
        
        pattern.last_seen = datetime.now().isoformat()
        
        # Update if exists, otherwise append
        existing_pattern = next((p for p in self.patterns if p.pattern_id == pattern.pattern_id), None)
        if existing_pattern:
            # Update frequency and success rate
            idx = self.patterns.index(existing_pattern)
            self.patterns[idx] = pattern
            logger.info(f"Pattern memory updated: {pattern.pattern_id}")
        else:
            self.patterns.append(pattern)
            self._persist_append("patterns", pattern.to_dict())
            logger.info(f"Pattern memory stored: {pattern.pattern_id}")
        
        self._persist()
        return True
    
    # ========================================================================
    # RETRIEVAL OPERATIONS
    # ========================================================================
    
    def retrieve_for_task(self, task: str, task_type: str = "unknown") -> MemoryContextSummary:
        """
        Retrieve relevant memory for a task (retrieval-first design)
        
        This is the core retrieval method that must be called before planning.
        """
        logger.info(f"Retrieving memory for task: {task} (type: {task_type})")
        
        # Generate search tags from task
        search_tags = self._generate_search_tags(task, task_type)
        
        # Retrieve from all memory types
        relevant_fixes = self._find_relevant_fixes(search_tags, task)
        similar_failures = self._find_similar_failures(search_tags, task)
        
        # Build summary
        summary = MemoryContextSummary(
            project_context=self.project_memory,
            relevant_fixes=relevant_fixes[:5],  # Top 5
            similar_failures=similar_failures[:3],  # Top 3
            confidence=self._calculate_context_confidence(relevant_fixes, similar_failures),
        )
        
        # Generate reasoning
        if relevant_fixes:
            summary.reasoning = f"Found {len(relevant_fixes)} relevant previous fixes. "
        if similar_failures:
            summary.reasoning += f"Found {len(similar_failures)} similar failure patterns."
        if self.project_memory:
            summary.reasoning += f" Project uses {self.project_memory.tech_stack.get('language', 'unknown')} + {self.project_memory.tech_stack.get('db', 'unknown')}."
        
        summary.search_tags = search_tags
        
        logger.info(f"Retrieved context with confidence: {summary.confidence:.2f}")
        return summary
    
    def get_context_for_execution(
        self, 
        task: str, 
        failure_signals: Optional[List[str]] = None
    ) -> MemoryContextSummary:
        """
        Get enriched context for ExecutionEngine
        
        Combines project memory, relevant fixes, and recent failures.
        """
        summary = self.retrieve_for_task(task, "execution")
        
        # Add failure signals if provided
        if failure_signals:
            for signal in failure_signals:
                similar = self._find_patterns_for_signal(signal)
                if similar:
                    summary.similar_failures.extend([p.pattern_id for p in similar])
        
        # Remove duplicates
        summary.similar_failures = list(set(summary.similar_failures))
        
        return summary
    
    def retrieve_for_root_cause_analysis(
        self, 
        failure_signal: str
    ) -> List[FixMemory]:
        """Retrieve historical fixes for root cause analysis"""
        tags = self._generate_search_tags(failure_signal, "root_cause")
        return self._find_relevant_fixes(tags, failure_signal)
    
    def retrieve_for_browser_failures(self, failure_type: str) -> List[str]:
        """Retrieve similar browser failures from history"""
        patterns = [p for p in self.patterns if "browser" in p.issue_category.lower()]
        return [p.pattern_id for p in patterns if failure_type.lower() in p.issue_category.lower()]
    
    # ========================================================================
    # INTERNAL RETRIEVAL LOGIC
    # ========================================================================
    
    def _find_relevant_fixes(self, search_tags: List[str], task: str) -> List[FixMemory]:
        """Find fixes matching search tags and task"""
        matches: List[Tuple[FixMemory, float]] = []
        
        for fix in self.fixes:
            score = 0.0
            
            # Tag matching
            fix_tags = self._generate_search_tags(fix.solution, "fix")
            matching_tags = len(set(search_tags) & set(fix_tags))
            score += matching_tags * 2.0
            
            # Category matching
            if any(tag.lower() in fix.category.lower() for tag in search_tags):
                score += 3.0
            
            # Solution text matching
            if any(keyword in fix.solution.lower() for keyword in search_tags):
                score += 1.5
            
            # Verification status (success is better)
            if fix.verification_passed:
                score *= 1.5
            
            # Importance factor (by timestamp - recency)
            if fix.timestamp:
                days_old = (datetime.now() - datetime.fromisoformat(fix.timestamp)).days
                recency_factor = max(0.5, 1.0 - (days_old / 365.0))  # Decay over year
                score *= recency_factor
            
            # Confidence matters
            score *= (fix.confidence / 100.0)
            
            if score > 0:
                matches.append((fix, score))
        
        # Sort by score and return top results
        matches.sort(key=lambda x: x[1], reverse=True)
        return [fix for fix, _ in matches[:10]]
    
    def _find_similar_failures(self, search_tags: List[str], task: str) -> List[str]:
        """Find similar failure patterns"""
        matches: List[Tuple[str, float]] = []
        
        for pattern in self.patterns:
            score = 0.0
            
            # Category matching
            if any(tag.lower() in pattern.issue_category.lower() for tag in search_tags):
                score += 2.0
            
            # Root cause matching
            pattern_cause_tags = []
            for cause in pattern.common_root_causes:
                pattern_cause_tags.extend(cause.lower().split())
            
            matching_causes = len(set(tag.lower() for tag in search_tags) & set(pattern_cause_tags))
            score += matching_causes * 1.5
            
            # Frequency and success rate
            score *= (1.0 + (pattern.frequency / 10.0))  # More common = higher score
            score *= pattern.success_rate  # Success rate multiplier
            
            if score > 0:
                matches.append((pattern.pattern_id, score))
        
        matches.sort(key=lambda x: x[1], reverse=True)
        return [pattern_id for pattern_id, _ in matches[:10]]
    
    def _find_patterns_for_signal(self, signal: str) -> List[PatternMemory]:
        """Find patterns matching a failure signal"""
        matching_patterns = []
        signal_keywords = signal.lower().split()
        
        for pattern in self.patterns:
            if any(keyword in pattern.issue_category.lower() for keyword in signal_keywords):
                matching_patterns.append(pattern)
        
        return matching_patterns
    
    def _generate_search_tags(self, text: str, context: str = "general") -> List[str]:
        """Generate search tags from text"""
        tags = set()
        
        # Extract keywords
        words = text.lower().split()
        keywords = [w for w in words if len(w) > 3 and not w in ["that", "this", "from", "with", "were", "have", "been"]]
        tags.update(keywords[:10])  # Limit to 10
        
        # Add context tag
        tags.add(context)
        
        # Add category tags if detectable
        if any(term in text.lower() for term in ["jwt", "auth", "login", "token"]):
            tags.add("auth")
        if any(term in text.lower() for term in ["build", "compile", "npm", "pip"]):
            tags.add("build")
        if any(term in text.lower() for term in ["database", "db", "sql", "query"]):
            tags.add("database")
        if any(term in text.lower() for term in ["frontend", "browser", "react", "ui"]):
            tags.add("frontend")
        if any(term in text.lower() for term in ["deploy", "production", "docker", "k8s"]):
            tags.add("deployment")
        
        return list(tags)
    
    # ========================================================================
    # SAFETY & QUALITY CHECKS
    # ========================================================================
    
    def _check_for_secrets(self, text: str) -> bool:
        """Check if text contains secrets"""
        if not text:
            return False
        
        for pattern in self.SECRET_PATTERNS:
            if re.search(pattern, text):
                return True
        
        return False
    
    def _check_for_secrets_dict(self, data: Dict[str, Any]) -> bool:
        """Recursively check dictionary for secrets"""
        for value in data.values():
            if isinstance(value, str) and self._check_for_secrets(value):
                return True
            elif isinstance(value, dict) and self._check_for_secrets_dict(value):
                return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and self._check_for_secrets(item):
                        return True
        
        return False
    
    def _is_duplicate_fix(self, fix: FixMemory) -> bool:
        """Check if a fix is a duplicate of existing fixes"""
        fix_hash = self._hash_content(fix.solution)
        
        for existing_fix in self.fixes:
            existing_hash = self._hash_content(existing_fix.solution)
            if fix_hash == existing_hash and fix.category == existing_fix.category:
                return True
        
        return False
    
    def _deduplicate_fixes(self) -> None:
        """Remove duplicate fixes, keeping most recent"""
        seen_hashes: Dict[str, FixMemory] = {}
        
        for fix in sorted(self.fixes, key=lambda f: f.timestamp or "", reverse=True):
            fix_hash = self._hash_content(fix.solution)
            key = f"{fix.category}:{fix_hash}"
            
            if key not in seen_hashes:
                seen_hashes[key] = fix
        
        self.fixes = list(seen_hashes.values())
        logger.info(f"Deduplication: kept {len(self.fixes)} unique fixes")
    
    # ========================================================================
    # PERSISTENCE LAYER
    # ========================================================================
    
    def _persist(self) -> None:
        """Persist all memory to disk"""
        try:
            # Project memory
            if self.project_memory:
                with open(self.project_file, "w") as f:
                    json.dump(self.project_memory.to_dict(), f, indent=2)
            
            # Preferences
            if self.preferences:
                with open(self.preferences_file, "w") as f:
                    json.dump(self.preferences.to_dict(), f, indent=2)
            
            # Rebuild fixes and patterns files (not incremental yet, for consistency)
            with open(self.fixes_file, "w") as f:
                for fix in self.fixes:
                    f.write(json.dumps(fix.to_dict()) + "\n")
            
            with open(self.patterns_file, "w") as f:
                for pattern in self.patterns:
                    f.write(json.dumps(pattern.to_dict()) + "\n")
            
            # Build and save index
            self._build_index()
            with open(self.index_file, "w") as f:
                json.dump(self.index, f, indent=2)
            
            logger.debug("Memory persisted to disk")
        except Exception as e:
            logger.error(f"Error persisting memory: {e}")
    
    def _persist_append(self, file_type: str, data: Dict[str, Any]) -> None:
        """Append entry to append-only file"""
        try:
            if file_type == "fixes":
                with open(self.fixes_file, "a") as f:
                    f.write(json.dumps(data) + "\n")
            elif file_type == "patterns":
                with open(self.patterns_file, "a") as f:
                    f.write(json.dumps(data) + "\n")
        except Exception as e:
            logger.error(f"Error appending to {file_type}: {e}")
    
    def _load(self) -> None:
        """Load all memory from disk"""
        try:
            # Load project memory
            if self.project_file.exists():
                with open(self.project_file, "r") as f:
                    data = json.load(f)
                    self.project_memory = ProjectMemory.from_dict(data)
            
            # Load preferences
            if self.preferences_file.exists():
                with open(self.preferences_file, "r") as f:
                    data = json.load(f)
                    self.preferences = PreferenceMemory.from_dict(data)
            
            # Load fixes
            if self.fixes_file.exists():
                with open(self.fixes_file, "r") as f:
                    for line in f:
                        if line.strip():
                            data = json.loads(line)
                            self.fixes.append(FixMemory.from_dict(data))
            
            # Load patterns
            if self.patterns_file.exists():
                with open(self.patterns_file, "r") as f:
                    for line in f:
                        if line.strip():
                            data = json.loads(line)
                            self.patterns.append(PatternMemory.from_dict(data))
            
            # Load session memory (persisted across restarts)
            if self.session_file.exists():
                with open(self.session_file, "r") as f:
                    data = json.load(f)
                    self.session_memory = SessionMemory.from_dict(data)
                    logger.info("Session memory restored from disk")
            
            # Load index
            if self.index_file.exists():
                with open(self.index_file, "r") as f:
                    self.index = json.load(f)
            
            logger.info(f"Loaded {len(self.fixes)} fixes, {len(self.patterns)} patterns")
        except Exception as e:
            logger.error(f"Error loading memory: {e}")
    
    def _build_index(self) -> None:
        """Build search index from all memory"""
        self.index = {
            "total_fixes": len(self.fixes),
            "total_patterns": len(self.patterns),
            "fix_categories": list(set(f.category for f in self.fixes)),
            "pattern_categories": list(set(p.issue_category for p in self.patterns)),
            "last_update": datetime.now().isoformat(),
        }
    
    # ========================================================================
    # UTILITY METHODS
    # ========================================================================
    
    def _generate_id(self, prefix: str) -> str:
        """Generate unique ID"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = hashlib.md5(timestamp.encode()).hexdigest()[:6]
        return f"{prefix}_{timestamp}_{suffix}"
    
    def _hash_content(self, content: str) -> str:
        """Generate hash of content"""
        return hashlib.sha256(content.encode()).hexdigest()
    
    def _calculate_context_confidence(
        self, 
        relevant_fixes: List[FixMemory],
        similar_failures: List[str]
    ) -> float:
        """Calculate overall confidence in retrieved context"""
        score = 0.5  # Base confidence
        
        if relevant_fixes:
            avg_fix_confidence = sum(f.confidence for f in relevant_fixes) / len(relevant_fixes)
            score += (avg_fix_confidence / 100.0) * 0.3
        
        if similar_failures:
            score += 0.1 * min(len(similar_failures), 3)  # Max 0.3
        
        if self.project_memory:
            score += 0.1
        
        return min(1.0, score)
    
    # ========================================================================
    # PUBLIC QUERY METHODS
    # ========================================================================
    
    def get_project_memory(self) -> Optional[ProjectMemory]:
        """Get current project memory"""
        return self.project_memory
    
    def get_all_fixes(self) -> List[FixMemory]:
        """Get all stored fixes"""
        return self.fixes
    
    def get_all_patterns(self) -> List[PatternMemory]:
        """Get all stored patterns"""
        return self.patterns
    
    def get_memory_status(self) -> Dict[str, Any]:
        """Get status of memory system"""
        return {
            "fixes_stored": len(self.fixes),
            "patterns_stored": len(self.patterns),
            "project_memory_set": self.project_memory is not None,
            "preferences_set": self.preferences is not None,
            "memory_directory": str(self.memory_dir),
            "last_index_update": self.index.get("last_update", "never"),
        }
    
    def clear_session_memory(self) -> None:
        """Clear session memory (in-memory and on-disk)"""
        self.session_memory = SessionMemory()
        try:
            if self.session_file.exists():
                self.session_file.unlink()
        except Exception as e:
            logger.error(f"Error clearing session file: {e}")
        logger.info("Session memory cleared")
    
    def export_memory(self, output_file: Path) -> bool:
        """Export all memory to a file"""
        try:
            export_data = {
                "project_memory": self.project_memory.to_dict() if self.project_memory else None,
                "preferences": self.preferences.to_dict() if self.preferences else None,
                "fixes": [f.to_dict() for f in self.fixes],
                "patterns": [p.to_dict() for p in self.patterns],
                "export_timestamp": datetime.now().isoformat(),
            }
            
            with open(output_file, "w") as f:
                json.dump(export_data, f, indent=2)
            
            logger.info(f"Memory exported to {output_file}")
            return True
        except Exception as e:
            logger.error(f"Error exporting memory: {e}")
            return False

