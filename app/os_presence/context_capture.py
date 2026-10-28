"""
System context capture for OS Presence Layer

Captures:
- Active window information
- Working directory
- Git information
- Browser URL (safe)
- IDE file context (safe)

Design: Fast, safe, non-invasive collection of public context
"""

import subprocess
import os
from pathlib import Path
from typing import Optional
from datetime import datetime
from app.utils.logger import get_logger
from app.os_presence.models import PopupContext

logger = get_logger(__name__)


class ContextCapture:
    """Capture system context for popup"""
    
    def __init__(self):
        """Initialize context capture"""
        self.max_window_title_length = 200
        self.max_url_length = 500
    
    def capture_context(self) -> PopupContext:
        """
        Capture full system context
        
        Returns:
            PopupContext with all available information
        """
        try:
            window_info = self._get_active_window()
            working_dir = self._get_working_directory()
            git_info = self._get_git_info(working_dir)
            browser_url = self._get_browser_url()
            ide_file = self._get_ide_file()
            
            return PopupContext(
                active_window=window_info['window_title'],
                active_app=window_info['app_name'],
                working_directory=working_dir,
                git_branch=git_info.get('branch'),
                git_status=git_info.get('status'),
                browser_url=browser_url,
                ide_file=ide_file,
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Error capturing context: {e}")
            # Return safe default if capture fails
            return self._get_safe_default_context()
    
    def _get_active_window(self) -> dict:
        """
        Get active window information using xdotool
        
        Returns:
            Dict with 'window_title' and 'app_name'
        """
        try:
            # Get active window ID
            result = subprocess.run(
                ['xdotool', 'getactivewindow'],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                return {'window_title': 'Unknown', 'app_name': 'Unknown'}
            
            window_id = result.stdout.strip()
            
            # Get window name
            name_result = subprocess.run(
                ['xdotool', 'getwindowname', window_id],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            window_title = name_result.stdout.strip() if name_result.returncode == 0 else 'Unknown'
            window_title = window_title[:self.max_window_title_length]
            
            # Get window class (app name)
            class_result = subprocess.run(
                ['xdotool', 'getwindowfocus', 'getwindowname'],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            # Parse class from wmctrl if available
            app_name = self._get_app_name_from_class(window_id)
            
            return {
                'window_title': window_title,
                'app_name': app_name
            }
        
        except FileNotFoundError:
            logger.warning("xdotool not found - cannot capture window info")
            return {'window_title': 'Unknown', 'app_name': 'Unknown'}
        except subprocess.TimeoutExpired:
            logger.warning("xdotool timed out")
            return {'window_title': 'Unknown', 'app_name': 'Unknown'}
        except Exception as e:
            logger.warning(f"Error getting active window: {e}")
            return {'window_title': 'Unknown', 'app_name': 'Unknown'}
    
    def _get_app_name_from_class(self, window_id: str) -> str:
        """Extract application name from window class"""
        try:
            result = subprocess.run(
                ['xprop', '-id', window_id, 'WM_CLASS'],
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode == 0 and result.stdout:
                # Parse WM_CLASS output: 'app.App'
                parts = result.stdout.split('"')
                if len(parts) >= 2:
                    return parts[1]
            
            return 'Unknown'
        except Exception:
            return 'Unknown'
    
    def _get_working_directory(self) -> str:
        """
        Get working directory
        
        Try to get from active terminal, fallback to home
        """
        try:
            # Try to get from environment
            pwd = os.environ.get('PWD', str(Path.home()))
            
            # Shorten if it's very long
            if len(pwd) > 200:
                # Keep home + last parts
                home = str(Path.home())
                if pwd.startswith(home):
                    parts = pwd[len(home):].lstrip('/').split('/')
                    if len(parts) > 3:
                        pwd = f"{home}/.../{'/'.join(parts[-3:])}"
            
            return pwd
        except Exception:
            return str(Path.home())
    
    def _get_git_info(self, cwd: str) -> dict:
        """
        Get git branch and status
        
        Only works if cwd is within a git repo
        """
        try:
            # Check if in git repo
            result = subprocess.run(
                ['git', 'rev-parse', '--git-dir'],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=2
            )
            
            if result.returncode != 0:
                return {'branch': None, 'status': None}
            
            # Get branch name
            branch_result = subprocess.run(
                ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=2
            )
            
            branch = branch_result.stdout.strip() if branch_result.returncode == 0 else None
            
            # Get status (clean vs dirty)
            status_result = subprocess.run(
                ['git', 'status', '--porcelain'],
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=2
            )
            
            status = 'dirty' if status_result.stdout.strip() else 'clean'
            
            return {'branch': branch, 'status': status}
        
        except subprocess.TimeoutExpired:
            logger.debug("Git commands timed out")
            return {'branch': None, 'status': None}
        except Exception as e:
            logger.debug(f"Error getting git info: {e}")
            return {'branch': None, 'status': None}
    
    def _get_browser_url(self) -> Optional[str]:
        """
        Get active browser URL (safe)
        
        Only captures URL, no other browser data
        This is deferred - not implemented in Phase 1
        """
        # Phase 1: Skip browser URL capture
        # Phase 2: Implement safe browser context capture
        return None
    
    def _get_ide_file(self) -> Optional[str]:
        """
        Get current IDE file context (safe)
        
        Only captures filename/path, not content
        This is deferred - not implemented in Phase 1
        """
        # Phase 1: Skip IDE context
        # Phase 2: Implement safe IDE integration
        return None
    
    def _get_safe_default_context(self) -> PopupContext:
        """Return safe default context when capture fails"""
        return PopupContext(
            active_window="Unknown",
            active_app="Unknown",
            working_directory=str(Path.home()),
            git_branch=None,
            git_status=None,
            browser_url=None,
            ide_file=None,
            timestamp=datetime.now()
        )


def capture_system_context() -> PopupContext:
    """
    Convenience function to capture context
    
    Returns:
        PopupContext with current system state
    """
    capturer = ContextCapture()
    return capturer.capture_context()
