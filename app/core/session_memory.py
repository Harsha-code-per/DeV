"""
Session Memory System for DeV

Stores and retrieves context across conversation turns.

Enables the agent to remember:
- What was analyzed
- What decisions were made
- Prior conversation history
- Execution results
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class AnalysisRecord:
    """Record of what was analyzed"""
    timestamp: str
    query: str
    tools_used: List[str]
    findings: str
    duration_seconds: float


@dataclass
class DecisionRecord:
    """Record of a decision made"""
    timestamp: str
    decision_type: str  # respond | clarify | execute | tool_use
    reasoning: str
    action_taken: str


@dataclass
class ExecutionRecord:
    """Record of execution results"""
    timestamp: str
    task: str
    status: str  # success | failed | in_progress
    changes: List[str]
    result_summary: str


@dataclass
class SessionMemory:
    """Complete session memory"""
    session_id: str
    created_at: str
    last_updated: str
    analyses: List[AnalysisRecord] = field(default_factory=list)
    decisions: List[DecisionRecord] = field(default_factory=list)
    executions: List[ExecutionRecord] = field(default_factory=list)
    conversation_history: List[Dict[str, str]] = field(default_factory=list)
    project_context: Dict[str, Any] = field(default_factory=dict)

    def add_analysis(
        self,
        query: str,
        tools_used: List[str],
        findings: str,
        duration_seconds: float = 0.0,
    ) -> None:
        """Record an analysis"""
        record = AnalysisRecord(
            timestamp=self._now(),
            query=query,
            tools_used=tools_used,
            findings=findings,
            duration_seconds=duration_seconds,
        )
        self.analyses.append(record)
        self._update_timestamp()

    def add_decision(
        self,
        decision_type: str,
        reasoning: str,
        action_taken: str,
    ) -> None:
        """Record a decision"""
        record = DecisionRecord(
            timestamp=self._now(),
            decision_type=decision_type,
            reasoning=reasoning,
            action_taken=action_taken,
        )
        self.decisions.append(record)
        self._update_timestamp()

    def add_execution(
        self,
        task: str,
        status: str,
        changes: List[str],
        result_summary: str,
    ) -> None:
        """Record execution results"""
        record = ExecutionRecord(
            timestamp=self._now(),
            task=task,
            status=status,
            changes=changes,
            result_summary=result_summary,
        )
        self.executions.append(record)
        self._update_timestamp()

    def add_conversation(self, role: str, message: str) -> None:
        """Add to conversation history"""
        self.conversation_history.append({
            "role": role,
            "message": message,
            "timestamp": self._now(),
        })
        self._update_timestamp()

    def get_recent_analyses(self, limit: int = 5) -> List[AnalysisRecord]:
        """Get recent analyses"""
        return self.analyses[-limit:]

    def get_recent_decisions(self, limit: int = 5) -> List[DecisionRecord]:
        """Get recent decisions"""
        return self.decisions[-limit:]

    def get_recent_executions(self, limit: int = 5) -> List[ExecutionRecord]:
        """Get recent executions"""
        return self.executions[-limit:]

    def get_conversation_summary(self, limit: int = 10) -> str:
        """Get summary of recent conversation"""
        recent = self.conversation_history[-limit:]
        lines = []

        for entry in recent:
            role = entry["role"].upper()
            message = entry["message"][:80]
            lines.append(f"{role}: {message}")

        return "\n".join(lines) if lines else "No recent conversation"

    def get_context_summary(self) -> str:
        """Get context summary for prompts"""
        summary_lines = []

        if self.project_context:
            summary_lines.append("Project Context:")
            if "type" in self.project_context:
                summary_lines.append(f"  Type: {self.project_context['type']}")
            if "stack" in self.project_context:
                summary_lines.append(f"  Stack: {self.project_context['stack']}")

        if self.analyses:
            recent = self.analyses[-1]
            summary_lines.append(f"\nRecent Analysis ({len(self.analyses)} total):")
            summary_lines.append(f"  Query: {recent.query}")
            summary_lines.append(f"  Tools: {', '.join(recent.tools_used)}")
            summary_lines.append(f"  Findings: {recent.findings[:100]}")

        if self.executions:
            recent = self.executions[-1]
            summary_lines.append(f"\nRecent Execution ({len(self.executions)} total):")
            summary_lines.append(f"  Task: {recent.task}")
            summary_lines.append(f"  Status: {recent.status}")
            if recent.changes:
                summary_lines.append(f"  Changes: {', '.join(recent.changes[:3])}")

        return "\n".join(summary_lines) if summary_lines else "No prior context"

    def _update_timestamp(self) -> None:
        """Update last modified timestamp"""
        self.last_updated = self._now()

    @staticmethod
    def _now() -> str:
        """Get current timestamp"""
        return datetime.utcnow().isoformat()


class SessionMemoryStore:
    """Persistent session memory storage"""

    def __init__(self, session_dir: Path):
        self.session_dir = session_dir
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.current_session: Optional[SessionMemory] = None

    def create_session(self, session_id: str) -> SessionMemory:
        """Create new session"""
        self.current_session = SessionMemory(
            session_id=session_id,
            created_at=datetime.utcnow().isoformat(),
            last_updated=datetime.utcnow().isoformat(),
        )
        logger.info(f"Created session: {session_id}")
        return self.current_session

    def load_session(self, session_id: str) -> Optional[SessionMemory]:
        """Load session from storage"""
        session_file = self.session_dir / f"{session_id}.json"

        if not session_file.exists():
            logger.warning(f"Session not found: {session_id}")
            return None

        try:
            data = json.loads(session_file.read_text())
            self.current_session = self._deserialize_session(data)
            logger.info(f"Loaded session: {session_id}")
            return self.current_session
        except Exception as e:
            logger.error(f"Failed to load session: {e}")
            return None

    def save_session(self) -> bool:
        """Save current session to disk"""
        if not self.current_session:
            logger.warning("No session to save")
            return False

        try:
            session_file = self.session_dir / f"{self.current_session.session_id}.json"
            data = self._serialize_session(self.current_session)
            session_file.write_text(json.dumps(data, indent=2))
            logger.debug(f"Saved session: {self.current_session.session_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to save session: {e}")
            return False

    def get_current_session(self) -> Optional[SessionMemory]:
        """Get current session"""
        return self.current_session

    def _serialize_session(self, session: SessionMemory) -> Dict[str, Any]:
        """Convert session to JSON-serializable dict"""
        return {
            "session_id": session.session_id,
            "created_at": session.created_at,
            "last_updated": session.last_updated,
            "analyses": [asdict(a) for a in session.analyses],
            "decisions": [asdict(d) for d in session.decisions],
            "executions": [asdict(e) for e in session.executions],
            "conversation_history": session.conversation_history,
            "project_context": session.project_context,
        }

    def _deserialize_session(self, data: Dict[str, Any]) -> SessionMemory:
        """Convert JSON dict to session"""
        session = SessionMemory(
            session_id=data["session_id"],
            created_at=data["created_at"],
            last_updated=data["last_updated"],
        )

        for a_data in data.get("analyses", []):
            session.analyses.append(AnalysisRecord(**a_data))

        for d_data in data.get("decisions", []):
            session.decisions.append(DecisionRecord(**d_data))

        for e_data in data.get("executions", []):
            session.executions.append(ExecutionRecord(**e_data))

        session.conversation_history = data.get("conversation_history", [])
        session.project_context = data.get("project_context", {})

        return session


class SessionManager:
    """High-level session management"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.session_dir = project_root / ".dev" / "sessions"
        self.store = SessionMemoryStore(self.session_dir)

    def start_session(self, session_id: Optional[str] = None) -> SessionMemory:
        """Start new session or load existing"""
        if not session_id:
            from datetime import datetime
            session_id = f"session_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # Try to load existing
        session = self.store.load_session(session_id)
        if session:
            return session

        # Create new
        return self.store.create_session(session_id)

    def save(self) -> bool:
        """Save current session"""
        return self.store.save_session()

    def get_session(self) -> Optional[SessionMemory]:
        """Get current session"""
        return self.store.get_current_session()

    def add_analysis(
        self,
        query: str,
        tools_used: List[str],
        findings: str,
        duration_seconds: float = 0.0,
    ) -> None:
        """Record analysis in current session"""
        session = self.get_session()
        if session:
            session.add_analysis(query, tools_used, findings, duration_seconds)

    def add_decision(
        self,
        decision_type: str,
        reasoning: str,
        action_taken: str,
    ) -> None:
        """Record decision in current session"""
        session = self.get_session()
        if session:
            session.add_decision(decision_type, reasoning, action_taken)

    def add_execution(
        self,
        task: str,
        status: str,
        changes: List[str],
        result_summary: str,
    ) -> None:
        """Record execution in current session"""
        session = self.get_session()
        if session:
            session.add_execution(task, status, changes, result_summary)

    def add_conversation(self, role: str, message: str) -> None:
        """Add to conversation history"""
        session = self.get_session()
        if session:
            session.add_conversation(role, message)

    def get_context_for_prompt(self) -> str:
        """Get context summary for LLM prompt"""
        session = self.get_session()
        if session:
            return session.get_context_summary()
        return ""
