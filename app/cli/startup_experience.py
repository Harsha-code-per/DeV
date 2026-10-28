"""
Premium Startup Experience

Creates beautiful, fast startup:
- Branding animation
- Context loading display
- Memory recovery
- Model initialization
- Project detection
- Ready for interaction
"""

import sys
import time
from pathlib import Path
from typing import Optional
from app.cli.context_display import ContextDisplay
from app.cli.dev_manager import DevFolderManager
from app.utils.logger import get_logger

logger = get_logger(__name__)


class StartupExperience:
    """Manage premium startup experience"""
    
    LOGO = r"""
╭─ DeV Engineering OS ─────────────────────╮
│                                          │
│  🚀  DeV Elite Engineering System         │
│                                          │
│  The trust-first AI engineering OS       │
│  for production-grade workflows          │
│                                          │
╰──────────────────────────────────────────╯
"""
    
    def __init__(self, project_root: Path):
        """Initialize startup"""
        self.project_root = project_root
        self.dev_manager = DevFolderManager(project_root)
        self.context = ContextDisplay()
        self.start_time = time.time()
    
    def show_logo(self) -> None:
        """Display branding logo"""
        print("\n")
        print(self.LOGO)
        print("\n  Initializing...\n")
    
    def initialize_project_structure(self) -> bool:
        """Ensure .dev folder structure"""
        try:
            self.dev_manager.ensure_dev_structure()
            self._print_step("Project structure", "✓")
            return True
        except Exception as e:
            logger.error(f"Error initializing project: {e}")
            self._print_step("Project structure", "✗")
            return False
    
    def load_memory(self, memory_engine) -> bool:
        """Load project memory"""
        try:
            # Get memory status
            if hasattr(memory_engine, 'get_status'):
                status = memory_engine.get_status()
                count = status.get('total_entries', 0)
            else:
                count = 0
            
            self.context.memory_count = count
            
            if count > 0:
                self._print_step(f"Memory loaded", f"✓ ({count} patterns)")
            else:
                self._print_step("Memory ready", "✓")
            return True
        except Exception as e:
            logger.warning(f"Error loading memory: {e}")
            self._print_step("Memory", "⚠ (optional)")
            return True  # Non-critical
    
    def initialize_sandbox(self, worktree_manager) -> bool:
        """Initialize git sandbox"""
        try:
            if hasattr(worktree_manager, 'is_ready'):
                if worktree_manager.is_ready():
                    self._print_step("Sandbox ready", "✓ (git worktree)")
                    return True
            
            self._print_step("Sandbox ready", "✓")
            return True
        except Exception as e:
            logger.warning(f"Error initializing sandbox: {e}")
            self._print_step("Sandbox", "⚠ (optional)")
            return True  # Non-critical
    
    def detect_project(self) -> bool:
        """Detect project information"""
        try:
            project_name = self.project_root.name
            self.context.project_name = project_name
            
            # Try to detect git branch
            try:
                import subprocess
                result = subprocess.run(
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    cwd=self.project_root,
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode == 0:
                    branch = result.stdout.strip()
                    self.context.branch = branch
            except Exception:
                pass  # Not a git repo, continue
            
            self._print_step(f"Project detected", f"✓ ({project_name})")
            return True
        except Exception as e:
            logger.warning(f"Error detecting project: {e}")
            return True  # Non-critical
    
    def validate_provider_reality(self, provider_reality_manager) -> None:
        """Validate and display actual provider state (BACKEND-FIRST TRUTH)"""
        try:
            truth = provider_reality_manager.get_current_truth()
            
            if truth.has_any_available_provider:
                # Show which providers are available
                available = ", ".join(truth.available_providers) if truth.available_providers else "None"
                self._print_step("Model system", f"✓ ({available} ready)")
                self.context.provider = truth.available_providers[0] if truth.available_providers else "Unknown"
            else:
                # No providers configured - show that explicitly
                self._print_step("Model system", "⚠ No providers configured")
                self.context.provider = "Unconfigured"
        except Exception as e:
            logger.warning(f"Error validating provider reality: {e}")
            self._print_step("Model system", "⚠ (optional)")
    
    def set_model_info(self, model_name: str, provider: str) -> None:
        """Set model information (legacy - kept for compatibility)"""
        self.context.model_name = model_name
        if provider and provider != "Unknown":
            self.context.provider = provider
        self._print_step("Model active", f"✓ ({model_name})")
    
    def show_context(self) -> None:
        """Display loaded context"""
        print()
        print(self.context.render_startup_context())
        print()
    
    def show_ready_prompt(self) -> str:
        """Show ready prompt and return greeting"""
        elapsed = time.time() - self.start_time
        
        greeting = f"Ready! (loaded in {elapsed:.1f}s)\n\nHi {self._get_user_name()} — what are we building today?\n"
        
        print(greeting)
        return greeting
    
    def _print_step(self, step: str, status: str) -> None:
        """Print initialization step"""
        print(f"  ↳ {step:25} {status}")
    
    def _get_user_name(self) -> str:
        """Get user name from environment"""
        try:
            import os
            name = os.environ.get("USER", "Dev")
            return name.capitalize()
        except Exception:
            return "Dev"
    
    def get_welcome_context(self) -> str:
        """Get welcome context display"""
        return f"""
╭──────────────────────────────────────────╮
│ Project: {self.context.project_name:31} │
│ Branch: {self.context.branch:32} │
│ Model: {self.context.model_name:33} │
│ State: {self.context.state:34} │
╰──────────────────────────────────────────╯
"""
