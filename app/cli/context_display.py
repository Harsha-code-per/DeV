"""
Context Display System

Displays beautiful context information:
- Model name and provider
- Project and branch
- Execution state
- Sandbox status
- Memory status
- Browser status
"""

from pathlib import Path
from typing import Optional
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ContextDisplay:
    """Display beautiful context information"""
    
    def __init__(self):
        """Initialize context display"""
        self.model_name = "Unknown"
        self.provider = "Unknown"
        self.project_name = "Unknown"
        self.branch = "Unknown"
        self.directory = str(Path.cwd())
        self.state = "ready"
        self.sandbox_id = None
        self.memory_count = 0
        self.browser_ready = False
    
    def update_from_state(self, cli_state) -> None:
        """Update display from CLI state"""
        try:
            self.model_name = cli_state.model_name or "Unknown"
            self.provider = cli_state.provider or "Unknown"
            self.project_name = cli_state.project_name or "Unknown"
            self.branch = cli_state.branch or "Unknown"
            self.state = cli_state.state or "ready"
        except Exception as e:
            logger.warning(f"Error updating context: {e}")
    
    def render_compact(self) -> str:
        """
        Render compact inline context (one line)
        
        Example:
        [DeepSeek V4 Flash] [portfolio-site] [feature/auth-fix] [ready]
        """
        return f"[{self.model_name}] [{self.project_name}] [{self.branch}] [{self.state}]"
    
    def render_panel(self) -> str:
        """
        Render full context panel (multi-line)
        
        Example:
        ┌─────────────────────────────────────────────────┐
        │ Model: DeepSeek V4 Flash (DeepSeek)            │
        │ Project: portfolio-site                        │
        │ Branch: feature/auth-fix                       │
        │ State: ready                                   │
        └─────────────────────────────────────────────────┘
        """
        lines = [
            "┌─────────────────────────────────────────────────┐",
            f"│ Model: {self.model_name:40} │",
            f"│ Provider: {self.provider:37} │",
            f"│ Project: {self.project_name:38} │",
            f"│ Branch: {self.branch:39} │",
        ]
        
        if self.sandbox_id:
            lines.append(f"│ Sandbox: {self.sandbox_id:37} │")
        
        if self.memory_count > 0:
            lines.append(f"│ Memory: {self.memory_count} patterns │")
        
        if self.browser_ready:
            lines.append(f"│ Browser: ready (Playwright)             │")
        
        lines.append("└─────────────────────────────────────────────────┘")
        
        return "\n".join(lines)
    
    def render_startup_context(self) -> str:
        """
        Render startup context display
        
        Example:
        ↳ Memory loaded (12 sessions)
        ↳ Sandbox ready (git worktree)
        ↳ Model active: DeepSeek V4 Flash
        ↳ Project detected: portfolio-site
        ↳ Git branch: feature/auth-fix
        """
        lines = []
        
        if self.memory_count > 0:
            lines.append(f"↳ Memory loaded ({self.memory_count} sessions)")
        else:
            lines.append("↳ Memory ready")
        
        if self.sandbox_id:
            lines.append(f"↳ Sandbox ready ({self.sandbox_id})")
        else:
            lines.append("↳ Sandbox ready (git worktree)")
        
        lines.append(f"↳ Model active: {self.model_name}")
        lines.append(f"↳ Project detected: {self.project_name}")
        lines.append(f"↳ Git branch: {self.branch}")
        
        if self.browser_ready:
            lines.append("↳ Browser validation: ready")
        
        return "\n".join(lines)
    
    def render_status_line(self) -> str:
        """
        Render single status line for footer
        
        Example:
        [Ready] DeepSeek V4 Flash @ portfolio-site [feature/auth-fix]
        """
        status_emoji = "✓" if self.state == "ready" else "⚙"
        return f"{status_emoji} {self.state:8} | {self.model_name:20} @ {self.project_name:20} [{self.branch}]"
    
    def render_execution_context(self, task_type: str, task_size: str) -> str:
        """
        Render execution context during task
        
        Example:
        Executing: [bug_fix] [small] on [feature/auth-fix]
        Sandbox: dev-1234
        """
        lines = [
            f"Executing: [{task_type}] [{task_size}] on [{self.branch}]",
        ]
        
        if self.sandbox_id:
            lines.append(f"Sandbox: {self.sandbox_id}")
        
        return "\n".join(lines)
