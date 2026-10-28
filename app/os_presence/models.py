"""
Data models for OS Presence Layer

Defines types for:
- PopupContext: Captured system context
- PopupSubmission: User task submission
- DaemonConfig: Daemon configuration
"""

from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Optional, Dict, Any
import json
import uuid


@dataclass
class PopupContext:
    """System context captured when popup is shown"""
    
    active_window: str              # Window title
    active_app: str                 # Application name
    working_directory: str          # Current working directory
    git_branch: Optional[str] = None    # Current git branch
    git_status: Optional[str] = None    # "clean" or "dirty"
    browser_url: Optional[str] = None   # Active browser URL if safe
    ide_file: Optional[str] = None      # Current IDE file
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PopupContext':
        """Create from dictionary"""
        if isinstance(data['timestamp'], str):
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


@dataclass
class PopupSubmission:
    """Task submission from popup"""
    
    task_text: str                  # User-entered task description
    context: PopupContext           # Captured context
    submission_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    submission_time: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            'submission_id': self.submission_id,
            'task_text': self.task_text,
            'context': self.context.to_dict(),
            'submission_time': self.submission_time.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PopupSubmission':
        """Create from dictionary"""
        if isinstance(data['submission_time'], str):
            data['submission_time'] = datetime.fromisoformat(data['submission_time'])
        
        context = PopupContext.from_dict(data['context'])
        return cls(
            task_text=data['task_text'],
            context=context,
            submission_id=data.get('submission_id', str(uuid.uuid4())),
            submission_time=data['submission_time'],
        )


@dataclass
class DaemonConfig:
    """Configuration for OS Presence daemon"""
    
    hotkey: str = "super+space"     # Global hotkey (pynput format)
    enable_context_capture: bool = True
    window_timeout_ms: int = 10000   # How long to wait for user input
    log_file: str = "~/.dev_daemon/logs/daemon.log"
    auto_restart: bool = True
    max_retries: int = 5
    retry_backoff_seconds: int = 5
    
    # Resource limits
    max_memory_mb: int = 100
    
    # Feature flags
    enable_browser_context: bool = True
    enable_ide_context: bool = True
    enable_git_context: bool = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DaemonConfig':
        """Create from dictionary"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
    
    @classmethod
    def from_json_file(cls, filepath: str) -> 'DaemonConfig':
        """Load configuration from JSON file"""
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            return cls.from_dict(data)
        except FileNotFoundError:
            # Return default config if file doesn't exist
            return cls()
    
    def to_json_file(self, filepath: str) -> bool:
        """Save configuration to JSON file"""
        try:
            import os
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'w') as f:
                json.dump(self.to_dict(), f, indent=2)
            return True
        except Exception as e:
            print(f"Error saving config: {e}")
            return False


@dataclass
class HotkeyEvent:
    """Event from hotkey listener"""
    
    event_type: str                 # "pressed" or "released"
    hotkey: str                     # The hotkey that triggered
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'event_type': self.event_type,
            'hotkey': self.hotkey,
            'timestamp': self.timestamp.isoformat(),
        }


@dataclass
class PopupResult:
    """Result of popup interaction"""
    
    success: bool                   # Whether user submitted or cancelled
    submission: Optional[PopupSubmission] = None
    error: Optional[str] = None
    cancel_reason: Optional[str] = None
    duration_ms: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'success': self.success,
            'submission': self.submission.to_dict() if self.submission else None,
            'error': self.error,
            'cancel_reason': self.cancel_reason,
            'duration_ms': self.duration_ms,
        }


@dataclass
class DaemonStatus:
    """Status of running daemon"""
    
    running: bool                   # Is daemon running
    uptime_seconds: int             # How long running
    hotkeys_triggered: int = 0      # Total hotkey events
    tasks_submitted: int = 0        # Total tasks submitted
    last_error: Optional[str] = None
    memory_mb: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'running': self.running,
            'uptime_seconds': self.uptime_seconds,
            'hotkeys_triggered': self.hotkeys_triggered,
            'tasks_submitted': self.tasks_submitted,
            'last_error': self.last_error,
            'memory_mb': self.memory_mb,
            'timestamp': self.timestamp.isoformat(),
        }
