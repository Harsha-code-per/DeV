"""
Simple Intent Detector

Minimal detector that only identifies:
- Slash commands (/model, /exit, etc)
- Everything else is natural input (goes to LLM)

No templates. No keyword matching for routing. Only safe command detection.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.utils.logger import get_logger

logger = get_logger(__name__)


class Intent(Enum):
    """User intent types"""
    COMMAND = "command"  # Starts with /
    TASK = "task"  # Natural input (goes to LLM)
    UNKNOWN = "unknown"


@dataclass
class IntentResult:
    """Result of intent detection"""
    intent: Intent
    confidence: float  # 0.0-1.0
    response: Optional[str] = None


class IntentDetector:
    """Minimal intent detector - only detects commands"""

    def detect(self, user_input: str) -> IntentResult:
        """
        Detect intent from user input

        Only detects:
        - COMMAND: Starts with /
        - TASK: Everything else (goes to model)

        Args:
            user_input: User message

        Returns:
            IntentResult with detected intent
        """
        text = user_input.strip() if user_input else ""

        if not text:
            return IntentResult(Intent.UNKNOWN, 0.0)

        # Check for slash commands (hard safety boundaries)
        if text.startswith("/"):
            return IntentResult(Intent.COMMAND, 1.0)

        # Everything else is natural input (goes to model)
        return IntentResult(Intent.TASK, 0.95)
