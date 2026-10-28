"""
Lightweight popup UI for OS Presence Layer

Uses tkinter for native, lightweight popup
Shows quickly, captures task input, displays context

Design: Minimal, focused, non-blocking
"""

from typing import Optional, Callable
from datetime import datetime
import time
from app.utils.logger import get_logger
from app.os_presence.models import PopupContext, PopupSubmission, PopupResult

# Import tkinter safely - may not be available in headless/test environments
try:
    import tkinter as tk
    from tkinter import ttk
    TKINTER_AVAILABLE = True
except ImportError:
    TKINTER_AVAILABLE = False
    # Create stubs for testing
    tk = None
    ttk = None

logger = get_logger(__name__)


class PopupWindow:
    """Lightweight popup window for task input"""
    
    def __init__(
        self,
        context: PopupContext,
        on_submit: Optional[Callable[[str], None]] = None,
        window_timeout_ms: int = 10000
    ):
        """
        Initialize popup window
        
        Args:
            context: System context to display
            on_submit: Callback when user submits (task text)
            window_timeout_ms: How long to wait before auto-close
        """
        self.context = context
        self.on_submit = on_submit
        self.window_timeout_ms = window_timeout_ms
        self.result: Optional[PopupResult] = None
        self.start_time = datetime.now()
        
        # UI elements
        self.root: Optional[tk.Tk] = None
        self.task_text_widget: Optional[tk.Text] = None
        self.root_instance: Optional[tk.Tk] = None
    
    def show(self) -> PopupResult:
        """
        Show popup and wait for user input
        
        Returns:
            PopupResult with submission or cancellation
        """
        try:
            self.root = tk.Tk()
            self.root_instance = self.root
            self._setup_window()
            self._setup_ui()
            
            # Run event loop
            self.root.mainloop()
            
            # Calculate duration
            duration = (datetime.now() - self.start_time).total_seconds() * 1000
            
            if self.result is None:
                self.result = PopupResult(
                    success=False,
                    cancel_reason="Window closed",
                    duration_ms=int(duration)
                )
            else:
                self.result.duration_ms = int(duration)
            
            return self.result
        
        except Exception as e:
            logger.error(f"Error showing popup: {e}")
            return PopupResult(
                success=False,
                error=str(e),
                duration_ms=int((datetime.now() - self.start_time).total_seconds() * 1000)
            )
    
    def _setup_window(self) -> None:
        """Configure window properties"""
        self.root.title("DeV Launcher")
        self.root.geometry("600x400")
        
        # Make window stay on top
        self.root.attributes('-topmost', True)
        
        # Center on screen
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        
        # Handle escape key
        self.root.bind('<Escape>', lambda e: self._on_cancel())
        
        # Style
        style = ttk.Style()
        style.theme_use('clam')
    
    def _setup_ui(self) -> None:
        """Build UI elements"""
        # Main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Title
        title_label = ttk.Label(
            main_frame,
            text="What should DeV execute?",
            font=('Helvetica', 14, 'bold')
        )
        title_label.grid(row=0, column=0, columnspan=2, sticky=tk.W, pady=(0, 10))
        
        # Task input label
        input_label = ttk.Label(main_frame, text="Task:")
        input_label.grid(row=1, column=0, sticky=tk.W, pady=(5, 5))
        
        # Task input field
        self.task_text_widget = tk.Text(
            main_frame,
            height=4,
            width=60,
            font=('Monospace', 10),
            wrap=tk.WORD
        )
        self.task_text_widget.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        self.task_text_widget.focus()
        
        # Context display
        context_label = ttk.Label(main_frame, text="Context:", font=('Helvetica', 10, 'bold'))
        context_label.grid(row=3, column=0, columnspan=2, sticky=tk.W, pady=(10, 5))
        
        # Context text frame
        context_frame = ttk.Frame(main_frame)
        context_frame.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        
        context_text = self._format_context()
        context_display = tk.Label(
            context_frame,
            text=context_text,
            justify=tk.LEFT,
            font=('Monospace', 9),
            fg='#666666'
        )
        context_display.pack(anchor=tk.W)
        
        # Button frame
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=5, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(10, 0))
        
        # Submit button
        submit_button = ttk.Button(
            button_frame,
            text="Submit",
            command=self._on_submit
        )
        submit_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # Cancel button
        cancel_button = ttk.Button(
            button_frame,
            text="Cancel (Esc)",
            command=self._on_cancel
        )
        cancel_button.pack(side=tk.LEFT)
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
    
    def _format_context(self) -> str:
        """Format context for display"""
        lines = []
        
        if self.context.active_app and self.context.active_app != "Unknown":
            lines.append(f"App: {self.context.active_app}")
        
        if self.context.working_directory:
            # Shorten long paths
            cwd = self.context.working_directory
            if len(cwd) > 50:
                cwd = cwd[-47:] if cwd.startswith('/') else cwd[-50:]
                cwd = f"...{cwd}"
            lines.append(f"Dir: {cwd}")
        
        if self.context.git_branch:
            branch_info = self.context.git_branch
            if self.context.git_status:
                branch_info += f" ({self.context.git_status})"
            lines.append(f"Git: {branch_info}")
        
        if self.context.browser_url:
            url = self.context.browser_url
            if len(url) > 60:
                url = url[:57] + "..."
            lines.append(f"URL: {url}")
        
        if self.context.ide_file:
            lines.append(f"File: {self.context.ide_file}")
        
        return "\n".join(lines) if lines else "No additional context"
    
    def _on_submit(self) -> None:
        """Handle submit button"""
        task_text = self.task_text_widget.get("1.0", tk.END).strip()
        
        if not task_text:
            logger.warning("Task submission with empty text")
            return
        
        # Create submission
        submission = PopupSubmission(
            task_text=task_text,
            context=self.context
        )
        
        self.result = PopupResult(
            success=True,
            submission=submission
        )
        
        # Call callback if provided
        if self.on_submit:
            try:
                self.on_submit(task_text)
            except Exception as e:
                logger.error(f"Error in submit callback: {e}")
        
        # Close window
        self.root.quit()
        self.root.destroy()
    
    def _on_cancel(self) -> None:
        """Handle cancel/close"""
        self.result = PopupResult(
            success=False,
            cancel_reason="User cancelled"
        )
        
        if self.root:
            self.root.quit()
            self.root.destroy()


class PopupManager:
    """Manage popup lifecycle"""
    
    def __init__(self):
        """Initialize popup manager"""
        self.current_popup: Optional[PopupWindow] = None
        self.is_showing = False
    
    def show_popup(
        self,
        context: PopupContext,
        on_submit: Optional[Callable[[str], None]] = None,
        window_timeout_ms: int = 10000
    ) -> PopupResult:
        """
        Show popup and get user input
        
        Args:
            context: System context to display
            on_submit: Callback when submitted
            window_timeout_ms: Timeout before auto-close
        
        Returns:
            PopupResult with user action
        """
        try:
            if self.is_showing:
                logger.warning("Popup already showing")
                return PopupResult(success=False, error="Popup already showing")
            
            self.is_showing = True
            self.current_popup = PopupWindow(context, on_submit, window_timeout_ms)
            result = self.current_popup.show()
            
            return result
        
        except Exception as e:
            logger.error(f"Error showing popup: {e}")
            return PopupResult(success=False, error=str(e))
        
        finally:
            self.is_showing = False
            self.current_popup = None
    
    def close_popup(self) -> bool:
        """Close current popup if showing"""
        try:
            if self.current_popup and self.current_popup.root:
                self.current_popup.root.quit()
                self.current_popup.root.destroy()
            self.is_showing = False
            return True
        except Exception as e:
            logger.error(f"Error closing popup: {e}")
            return False
