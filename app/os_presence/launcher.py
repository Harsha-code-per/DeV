"""
Main launcher orchestrator for OS Presence Layer

Integrates:
- Hotkey listening
- Popup UI
- Context capture
- ExecutionEngine handoff
- Daemon lifecycle

Design: Clean separation of concerns, trust-first integration
"""

from typing import Optional, Callable
from datetime import datetime
from app.utils.logger import get_logger
from app.os_presence.daemon import OSPresenceDaemon, DaemonLifecycleManager
from app.os_presence.models import DaemonConfig, PopupSubmission, DaemonStatus

logger = get_logger(__name__)


class OSPresenceLauncher:
    """Main launcher - orchestrates OS presence layer"""
    
    def __init__(
        self,
        config: Optional[DaemonConfig] = None,
        execution_engine: Optional[object] = None
    ):
        """
        Initialize launcher
        
        Args:
            config: DaemonConfig
            execution_engine: Reference to ExecutionEngine for task submission
        """
        self.config = config or DaemonConfig()
        self.execution_engine = execution_engine
        self.daemon: Optional[OSPresenceDaemon] = None
        self.submission_history = []
    
    def initialize(self, execution_engine: object) -> bool:
        """
        Initialize launcher with ExecutionEngine
        
        Args:
            execution_engine: ExecutionEngine instance
        
        Returns:
            True if initialized successfully
        """
        try:
            self.execution_engine = execution_engine
            logger.info("Launcher initialized with ExecutionEngine")
            return True
        except Exception as e:
            logger.error(f"Error initializing launcher: {e}")
            return False
    
    def start_daemon(self) -> bool:
        """
        Start the OS presence daemon
        
        Returns:
            True if started successfully
        """
        try:
            # Create daemon with task submission callback
            self.daemon = OSPresenceDaemon(
                config=self.config,
                on_task_submit=self._on_task_submitted
            )
            
            if self.daemon.start():
                logger.info("OS Presence daemon started successfully")
                return True
            else:
                logger.error("Failed to start daemon")
                return False
        
        except Exception as e:
            logger.error(f"Error starting daemon: {e}")
            return False
    
    def stop_daemon(self) -> bool:
        """Stop the daemon"""
        if self.daemon:
            return self.daemon.stop()
        return True
    
    def _on_task_submitted(self, task_text: str) -> None:
        """
        Handle task submission from popup
        
        Args:
            task_text: Task description from user
        """
        try:
            logger.info(f"Task submitted: {task_text}")
            
            # Record submission
            submission_record = {
                'task': task_text,
                'timestamp': datetime.now().isoformat(),
                'context': 'popup'
            }
            self.submission_history.append(submission_record)
            
            # Hand off to ExecutionEngine
            if self.execution_engine:
                self._submit_to_engine(task_text)
            else:
                logger.warning("ExecutionEngine not available - task recorded but not executed")
        
        except Exception as e:
            logger.error(f"Error processing task submission: {e}")
    
    def _submit_to_engine(self, task_text: str) -> bool:
        """
        Submit task to ExecutionEngine
        
        Args:
            task_text: Task description
        
        Returns:
            True if submitted successfully
        """
        try:
            logger.debug(f"Submitting task to ExecutionEngine: {task_text}")
            
            # Call ExecutionEngine.execute()
            # This preserves the full approval workflow
            if hasattr(self.execution_engine, 'execute'):
                result = self.execution_engine.execute(task=task_text)
                logger.info(f"Task submitted to engine, result: {result}")
                return True
            else:
                logger.error("ExecutionEngine does not have execute method")
                return False
        
        except Exception as e:
            logger.error(f"Error submitting to engine: {e}")
            return False
    
    def get_daemon_status(self) -> Optional[DaemonStatus]:
        """Get current daemon status"""
        if self.daemon:
            return self.daemon.get_status()
        return None
    
    def get_submission_history(self) -> list:
        """Get history of submissions"""
        return self.submission_history.copy()
    
    def clear_submission_history(self) -> None:
        """Clear submission history"""
        self.submission_history.clear()


class LauncherFactory:
    """Factory for creating and managing launchers"""
    
    _instance: Optional[OSPresenceLauncher] = None
    
    @classmethod
    def get_launcher(cls, config: Optional[DaemonConfig] = None) -> OSPresenceLauncher:
        """
        Get or create singleton launcher instance
        
        Args:
            config: DaemonConfig
        
        Returns:
            OSPresenceLauncher instance
        """
        if cls._instance is None:
            cls._instance = OSPresenceLauncher(config)
        return cls._instance
    
    @classmethod
    def reset(cls) -> None:
        """Reset singleton instance"""
        if cls._instance:
            cls._instance.stop_daemon()
        cls._instance = None


def initialize_os_presence(
    execution_engine: object,
    config: Optional[DaemonConfig] = None,
    auto_start: bool = False
) -> OSPresenceLauncher:
    """
    Initialize OS Presence layer
    
    Args:
        execution_engine: ExecutionEngine instance
        config: Optional DaemonConfig
        auto_start: Whether to start daemon immediately
    
    Returns:
        Initialized OSPresenceLauncher
    """
    try:
        launcher = LauncherFactory.get_launcher(config)
        launcher.initialize(execution_engine)
        
        if auto_start:
            launcher.start_daemon()
        
        logger.info("OS Presence layer initialized")
        return launcher
    
    except Exception as e:
        logger.error(f"Error initializing OS Presence layer: {e}")
        raise


def get_os_presence_launcher() -> OSPresenceLauncher:
    """Get the global launcher instance"""
    return LauncherFactory.get_launcher()
