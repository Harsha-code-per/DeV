"""
MemoryRetriever — Keyword/Tag-Based Retrieval Engine

Implements the retrieval-first design described in the DeV spec.

Responsibilities:
- Extract semantic search tags from free-form task descriptions
- Score FixMemory records against a query
- Score PatternMemory records against a query
- Rank results by composite score (relevance × confidence × recency)
- Provide explainable scoring (why a record was retrieved)

Design:
- Zero external ML dependencies (pure Python, fast, deterministic).
- Every scoring decision is transparent and auditable.
- Future: can be enhanced with lightweight TF-IDF or embeddings.

Scoring formula (for fixes)::

    score = tag_overlap * 2
          + category_match * 3
          + solution_text_match * 1.5
          + verification_bonus * 1.5  (multiplicative if passed)
          × recency_factor            (1.0 → 0.5 over 365 days)
          × (confidence / 100)

The final ranking is deterministic — same input always produces same order.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from app.utils.logger import setup_logger

logger = setup_logger(__name__)


# ---------------------------------------------------------------------------
# Domain vocabulary for tag extraction
# ---------------------------------------------------------------------------

# Maps keyword groups to canonical tags
_DOMAIN_PATTERNS: List[Tuple[str, List[str]]] = [
    ("auth",       ["jwt", "auth", "login", "token", "refresh", "bearer", "session", "oauth"]),
    ("build",      ["build", "compile", "npm", "pip", "webpack", "gradle", "maven", "cargo"]),
    ("database",   ["database", "db", "sql", "postgres", "mysql", "mongo", "redis", "migration"]),
    ("frontend",   ["frontend", "browser", "react", "vue", "angular", "ui", "css", "hydration"]),
    ("deployment", ["deploy", "docker", "k8s", "kubernetes", "nginx", "ci", "cd", "production"]),
    ("network",    ["cors", "http", "api", "request", "response", "timeout", "network", "ssl"]),
    ("testing",    ["test", "pytest", "jest", "spec", "unit", "integration", "e2e", "fixture"]),
    ("import",     ["import", "module", "require", "dependency", "package", "install"]),
    ("config",     ["config", "env", "environment", "settings", "yaml", "toml", "dotenv"]),
    ("runtime",    ["traceback", "exception", "error", "crash", "segfault", "null", "undefined"]),
]

# Stop-words to exclude from keyword extraction
_STOP_WORDS: Set[str] = {
    "the", "this", "that", "from", "with", "were", "have", "been",
    "will", "can", "could", "would", "should", "must", "into", "onto",
    "also", "then", "when", "what", "some", "such", "more", "your",
    "their", "there", "here", "just", "only", "very", "much",
}


class MemoryRetriever:
    """
    Production-grade keyword/tag-based retrieval engine.

    All retrieval is deterministic and explainable — every score can
    be traced back to specific matching criteria.

    Usage::

        retriever = MemoryRetriever()
        tags = retriever.extract_tags("Fix JWT login issue", context="execution")
        ranked = retriever.score_fixes(fixes, tags, "Fix JWT login issue")
    """

    # ------------------------------------------------------------------
    # Tag extraction
    # ------------------------------------------------------------------

    def extract_tags(self, text: str, context: str = "general") -> List[str]:
        """
        Extract search tags from free-form text.

        Tags come from three sources:
        1. Domain vocabulary matches (canonical tags like "auth", "database")
        2. Raw significant keywords (> 3 chars, not stop-words)
        3. Context tag (e.g. "execution", "root_cause")

        Returns a deduplicated, sorted list for deterministic behaviour.
        """
        tags: Set[str] = set()
        text_lower = text.lower()

        # 1. Domain vocabulary
        for canonical_tag, keywords in _DOMAIN_PATTERNS:
            if any(kw in text_lower for kw in keywords):
                tags.add(canonical_tag)

        # 2. Raw significant words
        raw_words = re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", text_lower)
        significant = [
            w for w in raw_words
            if w not in _STOP_WORDS and len(w) > 3
        ]
        tags.update(significant[:15])  # cap at 15 to avoid tag explosion

        # 3. Context
        if context:
            tags.add(context)

        result = sorted(tags)
        logger.debug(f"Extracted {len(result)} tags from text (context={context})")
        return result

    # ------------------------------------------------------------------
    # Fix scoring
    # ------------------------------------------------------------------

    def score_fixes(
        self,
        fixes: list,  # List[FixMemory] — avoid circular import
        search_tags: List[str],
        task: str,
        top_k: int = 10,
    ) -> list:
        """
        Score and rank FixMemory records by relevance to the query.

        Returns up to *top_k* FixMemory objects, highest score first.
        """
        scored: List[Tuple[object, float]] = []

        for fix in fixes:
            score = self._score_fix(fix, search_tags, task)
            if score > 0:
                scored.append((fix, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        results = [fix for fix, _ in scored[:top_k]]
        logger.debug(f"Scored {len(fixes)} fixes → {len(results)} relevant (top_k={top_k})")
        return results

    def _score_fix(self, fix, search_tags: List[str], task: str) -> float:
        """Compute relevance score for a single fix."""
        score = 0.0
        text_lower = task.lower()

        # Tag overlap with tags extracted from the fix's solution
        fix_tags = self.extract_tags(fix.solution, context="fix")
        fix_tags += self.extract_tags(fix.root_cause, context="fix")
        fix_tags += self.extract_tags(fix.category, context="fix")
        overlap = len(set(search_tags) & set(fix_tags))
        score += overlap * 2.0

        # Category exact/partial match
        if any(tag.lower() in fix.category.lower() for tag in search_tags):
            score += 3.0

        # Solution text contains query keywords
        if any(kw in fix.solution.lower() for kw in search_tags):
            score += 1.5

        # Verified fixes are more trustworthy
        if fix.verification_passed:
            score *= 1.5

        # Recency decay (recent → 1.0, year-old → 0.5)
        if fix.timestamp:
            try:
                days_old = (datetime.now() - datetime.fromisoformat(fix.timestamp)).days
                recency = max(0.5, 1.0 - (days_old / 365.0))
                score *= recency
            except (ValueError, TypeError):
                pass  # malformed timestamp — no recency penalty

        # Confidence weighting
        if fix.confidence:
            score *= fix.confidence / 100.0

        return score

    # ------------------------------------------------------------------
    # Pattern scoring
    # ------------------------------------------------------------------

    def score_patterns(
        self,
        patterns: list,  # List[PatternMemory]
        search_tags: List[str],
        task: str,
        top_k: int = 10,
    ) -> list:
        """
        Score and rank PatternMemory records by relevance to the query.
        """
        scored: List[Tuple[object, float]] = []

        for pattern in patterns:
            score = self._score_pattern(pattern, search_tags, task)
            if score > 0:
                scored.append((pattern, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [p for p, _ in scored[:top_k]]

    def _score_pattern(self, pattern, search_tags: List[str], task: str) -> float:
        """Compute relevance score for a single pattern."""
        score = 0.0

        # Category match
        if any(tag.lower() in pattern.issue_category.lower() for tag in search_tags):
            score += 2.0

        # Root cause content match
        cause_text = " ".join(pattern.common_root_causes).lower()
        cause_tags = self.extract_tags(cause_text, context="pattern")
        overlap = len(set(search_tags) & set(cause_tags))
        score += overlap * 1.5

        # Frequency and success rate boost
        if pattern.frequency and pattern.frequency > 0:
            score *= (1.0 + pattern.frequency / 10.0)
        if pattern.success_rate and pattern.success_rate > 0:
            score *= pattern.success_rate

        return score

    # ------------------------------------------------------------------
    # Tag similarity (for deduplication / search)
    # ------------------------------------------------------------------

    def tag_overlap_ratio(self, tags_a: List[str], tags_b: List[str]) -> float:
        """
        Compute Jaccard similarity between two tag lists.

        Returns a value in [0, 1].  1.0 = identical tags.
        """
        if not tags_a or not tags_b:
            return 0.0
        set_a = set(tags_a)
        set_b = set(tags_b)
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union else 0.0

    def is_semantically_similar(
        self,
        text_a: str,
        text_b: str,
        threshold: float = 0.4,
    ) -> bool:
        """
        Return True if two texts are semantically similar enough to be
        considered duplicates (based on tag Jaccard similarity).

        A threshold of 0.4 means 40 % tag overlap → near-duplicate.
        """
        tags_a = self.extract_tags(text_a)
        tags_b = self.extract_tags(text_b)
        ratio = self.tag_overlap_ratio(tags_a, tags_b)
        return ratio >= threshold
