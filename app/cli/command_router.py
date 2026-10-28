"""
Command Router

Routes user input to appropriate handlers:
- /help → help system
- /model → model selection
- /memory → memory access
- /doctor → system diagnostics
- /daemon → OS presence daemon control
- /config → configuration
- /exit → exit CLI
- Natural text → task classification + execution
"""

import re
from typing import Tuple, Optional, Callable
from app.cli.elite_models import TaskType, TaskSize, NaturalTaskRequest
from app.cli.task_classifier import TaskClassifier
from app.utils.logger import get_logger

logger = get_logger(__name__)


class CommandRouter:
    """Route user input to appropriate handler"""
    
    COMMANDS = {
        "help": "Show help information",
        "model": "Select model or view current model",
        "memory": "Access project memory and patterns",
        "doctor": "Run system diagnostics",
        "daemon": "Control OS presence daemon",
        "config": "Configure DeV settings",
        "execute": "Execute a task (legacy, use natural language instead)",
        "exit": "Exit CLI",
        "cancel": "Cancel current operation",
    }
    
    def __init__(self):
        """Initialize router"""
        self.classifier = TaskClassifier()
        self.handlers = {}
        self._register_default_handlers()
    
    def _register_default_handlers(self):
        """Register default command handlers"""
        # Commands are registered externally by CLI
        pass
    
    def register_handler(self, command: str, handler: Callable):
        """Register handler for command"""
        self.handlers[command] = handler
    
    def route(self, user_input: str) -> Tuple[str, Optional[str], any]:
        """
        Route user input
        
        Returns:
            (route_type: "command" | "natural", command_name: optional, data: optional)
        """
        user_input = user_input.strip()
        
        if not user_input:
            return ("empty", None, None)
        
        # Check for command
        if user_input.startswith("/"):
            return self._route_command(user_input)
        
        # Otherwise natural language task
        return ("natural", None, self._route_natural_task(user_input))
    
    def _route_command(self, user_input: str) -> Tuple[str, str, None]:
        """
        Route slash command
        
        Returns:
            (route_type: "command", command_name, None)
        """
        # Parse command
        match = re.match(r'^/(\w+)\s*(.*)', user_input)
        if not match:
            return ("error", "invalid_command", "Invalid command format")
        
        command = match.group(1)
        args = match.group(2).strip()
        
        if command not in self.COMMANDS:
            return ("error", "unknown_command", f"Unknown command: /{command}")
        
        logger.debug(f"Routed to command: {command}")
        return ("command", command, args if args else None)
    
    def _route_natural_task(self, user_input: str) -> NaturalTaskRequest:
        """
        Classify and route natural language task
        
        Returns:
            NaturalTaskRequest with classification
        """
        request = self.classifier.classify(user_input)
        logger.debug(f"Classified natural task: {request.task_type.value} ({request.task_size.value})")
        return request
    
    def get_command_help(self) -> str:
        """Get formatted command help"""
        lines = [
            "Available Commands:\n",
        ]
        
        for cmd, desc in self.COMMANDS.items():
            lines.append(f"  /{cmd:<10} {desc}")
        
        return "\n".join(lines)
    
    def get_quick_help(self) -> str:
        """Get quick help for natural workflow"""
        return """
💡 Natural Workflow (Recommended)

Just type what you want to do:
  "Fix production build failure"
  "Build authentication system"
  "Explain why login is breaking"
  "Test the new login flow"

DeV will automatically:
  → classify task size
  → create plan if needed
  → execute in isolated sandbox
  → show changes before applying

Commands (optional):
  /help     - Show full help
  /model    - Change AI model
  /memory   - Access project patterns
  /doctor   - System diagnostics
  /exit     - Exit

Type /help for more details.
"""
    
    def get_full_help(self) -> str:
        """Get full help text"""
        return f"""
╔════════════════════════════════════════╗
║  DeV Elite CLI Help                    ║
╚════════════════════════════════════════╝

{self.get_quick_help()}

SMALL TASKS (< 30 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Examples:
  • "Fix the login bug"
  • "Update configuration"
  • "Explain this error"
  • "Small refactor"

Workflow:
  → Quick plan
  → Execute
  → Show result
  → Option to apply

LARGE TASKS (> 30 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Examples:
  • "Build authentication system"
  • "Complete redesign"
  • "Major feature"
  • "System refactor"

Workflow:
  → Create detailed plan (.dev/plans/*.md)
  → Display for your review
  → You can edit the plan
  → Type 'proceed' when ready
  → Execute
  → Apply changes

SPECIAL COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{self.get_command_help()}

KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ctrl+C    - Cancel current operation
  Ctrl+D    - Exit gracefully
  Up/Down   - Command history
  Tab       - Auto-complete

PROJECT MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DeV remembers across sessions:
  • Project architecture
  • Previous fixes
  • Failure patterns
  • Deployment rules
  • Coding preferences

Type /memory to access project patterns.

BROWSER WORKFLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DeV can test frontend flows:
  • "Test login flow"
  • "Verify form validation"
  • "Check new route"
  • "Screenshot this page"

CONTEXT REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reference specific files in your task:
  • @file.md - Reference markdown
  • @plan.md - Reference plan
  • @error.log - Reference logs

Example:
  "Using @auth-plan.md, continue implementation"

SAFETY & TRUST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ All execution happens in isolated sandbox
✓ Changes require approval before applying
✓ Git history preserved
✓ Always safe to cancel

Questions? Type /help or /doctor for diagnostics.
"""
    
    def is_command(self, user_input: str) -> bool:
        """Check if input is a command"""
        return user_input.strip().startswith("/")
    
    def is_exit_command(self, user_input: str) -> bool:
        """Check if exit command"""
        return user_input.strip().lower() in ["/exit", "/quit", "/q"]
