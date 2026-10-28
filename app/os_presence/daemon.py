"""
Background daemon process for OS Presence Layer

Manages:
- Hotkey listening in background
- Popup lifecycle
- Task submission to ExecutionEngine
- Graceful shutdown and recovery

Design: Reliable daemon with crash recovery
"""

import signal
import sys
import time
from typing import Optional, Callable
from datetime import datetime
from pathlib import Path
from app.utils.logger import get_logger
from app.os_presence.hotkey import HotkeyManager
from app.os_presence.popup import PopupManager
from app.os_presence.context_capture import ContextCapture
from app.os_presence.models import HotkeyEvent, DaemonConfig, DaemonStatus

logger = get_logger(__name__)


class OSPresenceDaemon:
    """Background daemon for OS Presence Layer"""
    
    def __init__(
        self,
        config: Optional[DaemonConfig] = None,
        on_task_submit: Optional[Callable[[str], None]] = None
    ):
        """
        Initialize daemon
        
        Args:
            config: DaemonConfig object
            on_task_submit: Callback when task is submitted
        """
        self.config = config or DaemonConfig()
        self.on_task_submit = on_task_submit
        
        self.hotkey_manager = HotkeyManager()
        self.popup_manager = PopupManager()
        self.context_capture = ContextCapture()
        
        self.running = False
        self.start_time: Optional[datetime] = None
        self.hotkeys_triggered = 0
        self.tasks_submitted = 0
        self.last_error: Optional[str] = None
        
        self._setup_signal_handlers()
    
    def _setup_signal_handlers(self) -> None:
        """Setup signal handlers for graceful shutdown"""
        try:
            signal.signal(signal.SIGTERM, self._signal_handler)
            signal.signal(signal.SIGINT, self._signal_handler)
            logger.debug("Signal handlers registered")
        except Exception as e:
            logger.warning(f"Could not register signal handlers: {e}")
    
    def _signal_handler(self, signum, frame) -> None:
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.stop()
        sys.exit(0)
    
    def start(self) -> bool:
        """
        Start the daemon
        
        Returns:
            True if started successfully
        """
        try:
            if self.running:
                logger.warning("Daemon already running")
                return False
            
            logger.info("Starting OS Presence daemon...")
            
            # Register hotkey callback
            self.hotkey_manager.register_hotkey(
                self.config.hotkey,
                self._on_hotkey_pressed
            )
            
            # Start hotkey listening
            if not self.hotkey_manager.start_all():
                logger.error("Failed to start hotkey manager")
                return False
            
            self.running = True
            self.start_time = datetime.now()
            self.hotkeys_triggered = 0
            self.tasks_submitted = 0
            
            logger.info(f"Daemon started successfully (hotkey: {self.config.hotkey})")
            return True
        
        except Exception as e:
            logger.error(f"Error starting daemon: {e}")
            self.last_error = str(e)
            return False
    
    def stop(self) -> bool:
        """
        Stop the daemon gracefully
        
        Returns:
            True if stopped successfully
        """
        try:
            if not self.running:
                return True
            
            logger.info("Stopping daemon...")
            
            # Stop hotkey listening
            self.hotkey_manager.stop_all()
            
            # Close any open popup
            self.popup_manager.close_popup()
            
            self.running = False
            logger.info("Daemon stopped")
            return True
        
        except Exception as e:
            logger.error(f"Error stopping daemon: {e}")
            self.last_error = str(e)
            return False
    
    def _on_hotkey_pressed(self, event: HotkeyEvent) -> None:
        """
        Handle hotkey press event
        
        Args:
            event: The hotkey event
        """
        try:
            self.hotkeys_triggered += 1
            logger.debug(f"Hotkey pressed: {event.hotkey}")
            
            # Show popup
            self._show_popup_and_submit()
        
        except Exception as e:
            logger.error(f"Error handling hotkey: {e}")
            self.last_error = str(e)
    
    def _show_popup_and_submit(self) -> None:
        """Show popup and handle submission"""
        try:
            # Capture context
            context = self.context_capture.capture_context()
            logger.debug(f"Captured context: app={context.active_app}, dir={context.working_directory}")
            
            # Show popup
            def on_submit_callback(task_text: str) -> None:
                """Handle popup submission"""
                self.tasks_submitted += 1
                logger.info(f"Task submitted: {task_text}")
                
                # Call the main submit handler
                if self.on_task_submit:
                    try:
                        self.on_task_submit(task_text)
                    except Exception as e:
                        logger.error(f"Error in task submit handler: {e}")
            
            result = self.popup_manager.show_popup(
                context=context,
                on_submit=on_submit_callback,
                window_timeout_ms=self.config.window_timeout_ms
            )
            
            if result.success:
                logger.info(f"Popup submission accepted ({result.duration_ms}ms)")
            else:
                logger.debug(f"Popup cancelled: {result.cancel_reason}")
        
        except Exception as e:
            logger.error(f"Error in popup flow: {e}")
            self.last_error = str(e)
    
    def get_status(self) -> DaemonStatus:
        """Get current daemon status"""
        uptime_seconds = 0
        if self.start_time:
            uptime_seconds = int((datetime.now() - self.start_time).total_seconds())
        
        return DaemonStatus(
            running=self.running,
            uptime_seconds=uptime_seconds,
            hotkeys_triggered=self.hotkeys_triggered,
            tasks_submitted=self.tasks_submitted,
            last_error=self.last_error
        )
    
    def run_forever(self) -> None:
        """
        Run daemon forever (blocking)
        
        Useful for systemd services
        """
        try:
            if not self.start():
                sys.exit(1)
            
            logger.info("Daemon running (press Ctrl+C to stop)")
            
            # Keep running
            while self.running:
                time.sleep(0.5)
        
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
            self.stop()
        
        except Exception as e:
            logger.error(f"Unexpected error in daemon loop: {e}")
            self.stop()
            sys.exit(1)


class DaemonLifecycleManager:
    """Manage daemon lifecycle with crash recovery"""
    
    def __init__(self, config: Optional[DaemonConfig] = None):
        """Initialize lifecycle manager"""
        self.config = config or DaemonConfig()
        self.daemon: Optional[OSPresenceDaemon] = None
        self.retry_count = 0
        self.max_retries = self.config.max_retries
    
    def start(self, on_task_submit: Optional[Callable[[str], None]] = None) -> bool:
        """
        Start daemon with auto-recovery
        
        Args:
            on_task_submit: Callback for task submissions
        
        Returns:
            True if started successfully
        """
        try:
            self.daemon = OSPresenceDaemon(self.config, on_task_submit)
            
            if self.daemon.start():
                self.retry_count = 0
                return True
            else:
                return False
        
        except Exception as e:
            logger.error(f"Error starting daemon: {e}")
            return False
    
    def stop(self) -> bool:
        """Stop daemon"""
        if self.daemon:
            return self.daemon.stop()
        return True
    
    def is_running(self) -> bool:
        """Check if daemon is running"""
        return self.daemon.running if self.daemon else False
    
    def get_status(self) -> Optional[DaemonStatus]:
        """Get daemon status"""
        return self.daemon.get_status() if self.daemon else None
    
    def run_forever(self) -> None:
        """Run daemon forever with recovery"""
        while True:
            try:
                if not self.start():
                    self.retry_count += 1
                    if self.retry_count >= self.max_retries:
                        logger.error(f"Max retries ({self.max_retries}) exceeded, giving up")
                        sys.exit(1)
                    
                    wait_seconds = self.config.retry_backoff_seconds * (2 ** (self.retry_count - 1))
                    logger.warning(f"Retrying in {wait_seconds}s (attempt {self.retry_count}/{self.max_retries})")
                    time.sleep(wait_seconds)
                else:
                    # Run daemon
                    self.daemon.run_forever()
            
            except KeyboardInterrupt:
                logger.info("Lifecycle manager received interrupt")
                self.stop()
                sys.exit(0)
            
            except Exception as e:
                logger.error(f"Unexpected error in lifecycle manager: {e}")
                self.retry_count += 1
                if self.retry_count >= self.max_retries:
                    logger.error("Max retries exceeded")
                    sys.exit(1)
                
                wait_seconds = self.config.retry_backoff_seconds * (2 ** (self.retry_count - 1))
                logger.warning(f"Retrying in {wait_seconds}s")
                time.sleep(wait_seconds)
