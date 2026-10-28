"""
Comprehensive tests for OS Presence Layer

Test Coverage:
- Data models (8 tests)
- Context capture (4 tests)
- Hotkey system (4 tests)
- Popup UI (3 tests)
- Daemon lifecycle (4 tests)
- Launcher orchestration (3 tests)
"""

import pytest
import tempfile
from pathlib import Path
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock

from app.os_presence.models import (
    PopupContext, PopupSubmission, DaemonConfig,
    HotkeyEvent, PopupResult, DaemonStatus
)
from app.os_presence.context_capture import ContextCapture, capture_system_context
from app.os_presence.hotkey import HotkeyListener, HotkeyManager
from app.os_presence.popup import PopupWindow, PopupManager
from app.os_presence.daemon import OSPresenceDaemon, DaemonLifecycleManager
from app.os_presence.launcher import OSPresenceLauncher, LauncherFactory


class TestDataModels:
    """Test data model creation and serialization"""
    
    def test_popup_context_creation(self):
        """Test PopupContext creation"""
        context = PopupContext(
            active_window="VSCode - test.py",
            active_app="code",
            working_directory="/home/user/project"
        )
        
        assert context.active_window == "VSCode - test.py"
        assert context.active_app == "code"
        assert context.working_directory == "/home/user/project"
    
    def test_popup_context_serialization(self):
        """Test PopupContext to_dict and from_dict"""
        context = PopupContext(
            active_window="Window Title",
            active_app="firefox",
            working_directory="/home/user",
            git_branch="main",
            git_status="clean"
        )
        
        data = context.to_dict()
        restored = PopupContext.from_dict(data)
        
        assert restored.active_window == context.active_window
        assert restored.git_branch == context.git_branch
    
    def test_popup_submission_creation(self):
        """Test PopupSubmission creation"""
        context = PopupContext(
            active_window="test",
            active_app="test",
            working_directory="/tmp"
        )
        
        submission = PopupSubmission(
            task_text="Fix build error",
            context=context
        )
        
        assert submission.task_text == "Fix build error"
        assert submission.context == context
        assert submission.submission_id is not None
    
    def test_daemon_config_defaults(self):
        """Test DaemonConfig default values"""
        config = DaemonConfig()
        
        assert config.hotkey == "super+space"
        assert config.enable_context_capture is True
        assert config.window_timeout_ms == 10000
        assert config.max_memory_mb == 100
    
    def test_daemon_config_serialization(self):
        """Test DaemonConfig serialization"""
        config = DaemonConfig(
            hotkey="ctrl+shift+space",
            enable_context_capture=False,
            max_retries=3
        )
        
        data = config.to_dict()
        restored = DaemonConfig.from_dict(data)
        
        assert restored.hotkey == "ctrl+shift+space"
        assert restored.enable_context_capture is False
        assert restored.max_retries == 3
    
    def test_daemon_config_json_file(self):
        """Test loading and saving config from/to JSON file"""
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config.json"
            
            # Save config
            config = DaemonConfig(hotkey="super+space", max_retries=5)
            assert config.to_json_file(str(config_path))
            assert config_path.exists()
            
            # Load config
            loaded = DaemonConfig.from_json_file(str(config_path))
            assert loaded.hotkey == "super+space"
            assert loaded.max_retries == 5
    
    def test_popup_result_success(self):
        """Test PopupResult for success case"""
        context = PopupContext(
            active_window="test",
            active_app="test",
            working_directory="/tmp"
        )
        submission = PopupSubmission(task_text="test", context=context)
        
        result = PopupResult(success=True, submission=submission)
        
        assert result.success is True
        assert result.submission == submission
    
    def test_daemon_status_creation(self):
        """Test DaemonStatus creation"""
        status = DaemonStatus(
            running=True,
            uptime_seconds=3600,
            hotkeys_triggered=5,
            tasks_submitted=3
        )
        
        assert status.running is True
        assert status.uptime_seconds == 3600


class TestContextCapture:
    """Test system context capture"""
    
    def test_context_capture_initialization(self):
        """Test ContextCapture initialization"""
        capture = ContextCapture()
        
        assert capture.max_window_title_length == 200
        assert capture.max_url_length == 500
    
    def test_capture_system_context_returns_context(self):
        """Test that capture_system_context returns PopupContext"""
        # May not have xdotool on test system, but should still return default
        context = capture_system_context()
        
        assert isinstance(context, PopupContext)
        assert context.active_window is not None
        assert context.working_directory is not None
    
    def test_working_directory_capture(self):
        """Test working directory capture"""
        capture = ContextCapture()
        cwd = capture._get_working_directory()
        
        assert isinstance(cwd, str)
        assert len(cwd) > 0
    
    def test_git_info_outside_repo(self):
        """Test git info capture outside repo"""
        capture = ContextCapture()
        git_info = capture._get_git_info("/tmp")
        
        # Should return None/empty git info
        assert git_info is not None


class TestHotkeySystem:
    """Test hotkey listening"""
    
    def test_hotkey_listener_initialization(self):
        """Test HotkeyListener initialization"""
        listener = HotkeyListener("super+space")
        
        assert listener.hotkey_combo == "super+space"
        assert len(listener.listeners) == 0
    
    def test_hotkey_listener_add_callback(self):
        """Test adding callback to hotkey listener"""
        listener = HotkeyListener("super+space")
        
        def callback(event):
            pass
        
        listener.add_listener(callback)
        assert len(listener.listeners) == 1
    
    def test_hotkey_listener_remove_callback(self):
        """Test removing callback"""
        listener = HotkeyListener("super+space")
        
        def callback(event):
            pass
        
        listener.add_listener(callback)
        assert len(listener.listeners) == 1
        
        listener.remove_listener(callback)
        assert len(listener.listeners) == 0
    
    def test_hotkey_manager_initialization(self):
        """Test HotkeyManager initialization"""
        manager = HotkeyManager()
        
        assert len(manager.listeners) == 0
        assert manager.is_running is False


class TestPopupUI:
    """Test popup UI"""
    
    def test_popup_manager_initialization(self):
        """Test PopupManager initialization"""
        manager = PopupManager()
        
        assert manager.current_popup is None
        assert manager.is_showing is False
    
    def test_popup_result_dict_conversion(self):
        """Test PopupResult to_dict"""
        result = PopupResult(success=False, cancel_reason="User cancelled")
        
        data = result.to_dict()
        
        assert data['success'] is False
        assert data['cancel_reason'] == "User cancelled"
    
    def test_popup_manager_not_double_show(self):
        """Test that popup manager rejects showing when already showing"""
        manager = PopupManager()
        manager.is_showing = True
        
        context = PopupContext(
            active_window="test",
            active_app="test",
            working_directory="/tmp"
        )
        
        result = manager.show_popup(context)
        
        assert result.success is False
        assert result.error is not None


class TestDaemonLifecycle:
    """Test daemon lifecycle"""
    
    def test_daemon_initialization(self):
        """Test OSPresenceDaemon initialization"""
        config = DaemonConfig()
        daemon = OSPresenceDaemon(config=config)
        
        assert daemon.running is False
        assert daemon.hotkeys_triggered == 0
        assert daemon.tasks_submitted == 0
    
    def test_daemon_can_stop(self):
        """Test daemon stop when not running"""
        daemon = OSPresenceDaemon()
        
        assert daemon.stop() is True
    
    def test_daemon_get_status(self):
        """Test getting daemon status"""
        daemon = OSPresenceDaemon()
        status = daemon.get_status()
        
        assert isinstance(status, DaemonStatus)
        assert status.running is False
    
    def test_lifecycle_manager_initialization(self):
        """Test DaemonLifecycleManager initialization"""
        manager = DaemonLifecycleManager()
        
        assert manager.daemon is None
        assert manager.retry_count == 0


class TestLauncherOrchestration:
    """Test launcher orchestration"""
    
    def test_launcher_initialization(self):
        """Test OSPresenceLauncher initialization"""
        launcher = OSPresenceLauncher()
        
        assert launcher.execution_engine is None
        assert len(launcher.submission_history) == 0
    
    def test_launcher_initialize_with_engine(self):
        """Test initializing launcher with ExecutionEngine"""
        launcher = OSPresenceLauncher()
        mock_engine = Mock()
        
        assert launcher.initialize(mock_engine) is True
        assert launcher.execution_engine == mock_engine
    
    def test_launcher_factory_singleton(self):
        """Test LauncherFactory singleton pattern"""
        LauncherFactory.reset()
        
        launcher1 = LauncherFactory.get_launcher()
        launcher2 = LauncherFactory.get_launcher()
        
        assert launcher1 is launcher2
        
        LauncherFactory.reset()


class TestIntegration:
    """Integration tests"""
    
    def test_popup_context_to_submission(self):
        """Test creating submission from context"""
        context = PopupContext(
            active_window="VSCode",
            active_app="code",
            working_directory="/home/user/project",
            git_branch="feature/test"
        )
        
        submission = PopupSubmission(
            task_text="Fix build error",
            context=context
        )
        
        assert submission.task_text == "Fix build error"
        assert submission.context.active_app == "code"
        assert submission.context.git_branch == "feature/test"
    
    def test_launcher_submission_history(self):
        """Test launcher records submission history"""
        launcher = OSPresenceLauncher()
        mock_engine = Mock()
        launcher.initialize(mock_engine)
        
        # Simulate submission
        launcher._on_task_submitted("Test task")
        
        history = launcher.get_submission_history()
        assert len(history) == 1
        assert history[0]['task'] == "Test task"
    
    def test_launcher_clear_history(self):
        """Test clearing submission history"""
        launcher = OSPresenceLauncher()
        launcher._on_task_submitted("Task 1")
        launcher._on_task_submitted("Task 2")
        
        assert len(launcher.get_submission_history()) == 2
        
        launcher.clear_submission_history()
        assert len(launcher.get_submission_history()) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
