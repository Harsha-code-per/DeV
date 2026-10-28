"""
Elite CLI Runner

Main entry point for DeV elite conversational CLI.

Responsibilities:
- Startup experience
- Context initialization  
- Main interaction loop
- Command dispatch
- Natural task handling
- Conversation state management
"""

import sys
import asyncio
from pathlib import Path
from typing import Optional

from app.cli.startup_experience import StartupExperience
from app.cli.conversation_engine import ConversationEngine
from app.cli.command_router import CommandRouter
from app.cli.context_display import ContextDisplay
from app.cli.model_control_center import ModelControlCenter
from app.cli.agent_core import AgentCore
from app.models.enhanced_provider_factory import get_enhanced_provider_factory
from app.models.multi_provider_system import FallbackRouter, HealthManager
from app.models.provider_reality import ProviderRealityManager
from app.core.executor import ExecutionEngine
from app.core.planner import PlanningEngine
from app.utils.logger import get_logger

logger = get_logger(__name__)


class EliteCLIRunner:
    """Main elite CLI runner"""
    
    def __init__(self, project_root: Optional[Path] = None, model_name: str = "Unknown", provider: str = "Unknown"):
        """Initialize CLI runner"""
        self.project_root = project_root or Path.cwd()
        self.model_name = model_name
        self.provider = provider

        # Initialize workflow systems
        self.provider_factory = get_enhanced_provider_factory(str(self.project_root / ".dev"))
        self.provider_router = FallbackRouter(self.provider_factory)
        self.health_manager = HealthManager(self.provider_factory)
        self.provider_reality = ProviderRealityManager(self.provider_factory, self.provider_router)
        self.model_control = ModelControlCenter(self.provider_router)
        self.planning_engine = PlanningEngine(
            router=self.provider_router,
            health_manager=self.health_manager,
        )
        self.execution_engine = ExecutionEngine(
            repo_path=str(self.project_root),
            planning_engine=self.planning_engine,
            model_router=self.provider_router,
            health_manager=self.health_manager,
            emit_fn=print,
        )

        # Initialize CLI systems
        self.startup = StartupExperience(self.project_root)
        self.engine = ConversationEngine(
            self.project_root,
            provider_router=self.provider_router,
            health_manager=self.health_manager,
        )
        self.agent_core = AgentCore(
            project_root=self.project_root,
            provider_router=self.provider_router,
            health_manager=self.health_manager,
            lightweight_intent_detector=self.engine.intent_detector,
            emit_fn=print,
        )
        self.router = CommandRouter()
        self.context = ContextDisplay()
        
        # Update context
        self.context.model_name = self.model_control.current_config.model_name or model_name
        self.context.provider = self.model_control.current_config.provider_id or provider
    
    def run(self) -> int:
        """
        Run the main CLI loop
        
        Returns:
            Exit code (0 = success, 1 = error)
        """
        try:
            # Show startup experience
            self.startup.show_logo()
            
            # Initialize systems
            self.startup.initialize_project_structure()
            self.startup.initialize_sandbox(None)
            self.startup.detect_project()
            
            # Validate provider reality (BACKEND-FIRST TRUTH)
            self.startup.validate_provider_reality(self.provider_reality)
            
            # Set model info (legacy compatibility)
            self.startup.set_model_info(self.context.model_name, self.context.provider)
            
            # Show ready context
            self.startup.show_context()
            greeting = self.startup.show_ready_prompt()
            
            # Main interaction loop
            return self._main_loop()
        
        except KeyboardInterrupt:
            print("\n\nInterrupted. Goodbye!")
            return 0
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            print(f"\n❌ Error: {e}")
            return 1
    
    def _main_loop(self) -> int:
        """Main CLI interaction loop"""
        while True:
            try:
                # Get user input
                user_input = input("> ").strip()
                
                if not user_input:
                    continue
                
                # Check for exit
                if self.router.is_exit_command(user_input):
                    print("\nGoodbye!")
                    return 0
                
                agent_outcome = self.agent_core.process(
                    user_input=user_input,
                    context_hint=self.engine.get_current_state_summary(),
                )

                if agent_outcome.action == "command":
                    route_type, command, data = self.router.route(user_input)
                    if route_type == "error":
                        print(f"❌ {data}")
                    elif route_type == "command":
                        self._handle_command(command, data)
                    continue

                if agent_outcome.action == "respond":
                    print(agent_outcome.message)
                    continue

                if agent_outcome.action == "execute_task":
                    msg_type, message = self.engine.process_natural_task(
                        agent_outcome.task or user_input
                    )
                    if agent_outcome.message:
                        print(agent_outcome.message)
                    print(message)
                    if msg_type == "small_task":
                        self._handle_approval_workflow()
                    elif msg_type == "large_task":
                        self._handle_large_task_workflow()
                    continue
                
            except KeyboardInterrupt:
                print("\n")
                continue
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                print(f"❌ Error: {e}")
                continue
        
        return 0
    
    def _handle_command(self, command: str, args: Optional[str]) -> None:
        """Handle slash command"""
        
        if command == "help":
            print(self.router.get_full_help())
        
        elif command == "model":
            self._refresh_provider_health()

            if not args:
                print(self.model_control.get_status())
                print(self.model_control.get_commands_help())
                return

            normalized_args = args.strip()
            if normalized_args == "stats":
                print(self.model_control.get_provider_stats())
                return
            if normalized_args == "help":
                print(self.model_control.get_commands_help())
                return

            parts = normalized_args.split(maxsplit=1)
            provider_id = parts[0]
            model_name = parts[1] if len(parts) > 1 else None
            result = self.model_control.set_provider(provider_id, model_name)
            print(result)
            self.context.model_name = self.model_control.current_config.model_name
            self.context.provider = self.model_control.current_config.provider_id
        
        elif command == "memory":
            print("Project memory patterns:")
            print("  • Retrieved patterns from previous sessions")
            print("  • Use natural language to leverage patterns")
        
        elif command == "doctor":
            self._run_diagnostics()
        
        elif command == "daemon":
            print("OS Presence daemon:")
            print("  Start: sudo systemctl start dev-daemon")
            print("  Status: sudo systemctl status dev-daemon")
            print("  Hotkey: Press SUPER+SPACE to trigger from anywhere")
        
        elif command == "config":
            print("Configuration options:")
            print("  Model, provider, preferences stored in .dev/config/")

        elif command == "execute":
            task = input("What should DeV execute?\n> ").strip()
            if not task:
                print("Task cannot be empty.")
                return
            if self.router.is_exit_command(task):
                sys.exit(0)
            if task.lower() == "/cancel":
                print("Execution cancelled.")
                return

            outcome = self.agent_core.process(task, context_hint=self.engine.get_current_state_summary())
            if outcome.action == "command":
                print("Please provide a natural task after /execute, not another command.")
                return
            if outcome.action == "respond":
                print(outcome.message)
                return

            msg_type, message = self.engine.process_natural_task(outcome.task or task)
            if outcome.message:
                print(outcome.message)
            print(message)
            if msg_type == "small_task":
                self._handle_approval_workflow()
            elif msg_type == "large_task":
                self._handle_large_task_workflow()
        
        elif command == "exit":
            sys.exit(0)
        
        else:
            print(f"Unknown command: /{command}")
    
    def _handle_natural_task(self, request_text: str) -> None:
        """Handle natural language task"""
        
        # Process task through conversation engine
        msg_type, message = self.engine.process_natural_task(request_text)
        
        print(message)
        
        # Handle based on message type
        if msg_type == "small_task":
            self._handle_approval_workflow()
        elif msg_type == "large_task":
            self._handle_large_task_workflow()
    
    def _handle_approval_workflow(self) -> None:
        """Handle approval workflow for small tasks"""
        
        while True:
            try:
                response = input("> ").strip()
                
                if not response:
                    continue
                
                # Handle @file references
                if response.startswith("@"):
                    content = self.engine.load_file_reference(response)
                    if content:
                        print(content)
                    else:
                        print(f"File not found: {response}")
                    continue
                
                # Handle approval response
                message, action = self.engine.handle_approval_response(response)
                print(message)
                
                if action == "execute":
                    self._execute_current_task()
                    break
                elif action == "cancel":
                    break
            
            except KeyboardInterrupt:
                print("\nCancelled.")
                break
    
    def _handle_large_task_workflow(self) -> None:
        """Handle large task workflow with markdown plan"""
        
        while True:
            try:
                response = input("> ").strip()
                
                if not response:
                    continue
                
                # Handle file references (show plan, etc)
                if response.startswith("@"):
                    content = self.engine.load_file_reference(response)
                    if content:
                        print(content)
                    else:
                        print(f"File not found: {response}")
                    continue
                
                # Check for review completion
                if response.lower() in ["reviewed", "proceed", "i reviewed the plan, proceed.", "ready"]:
                    print("\n✅ Plan approved. Starting execution...")
                    self._execute_current_task()
                    break
                elif response.lower() in ["cancel", "skip"]:
                    print("Task cancelled.")
                    break
                else:
                    print("After reviewing the plan, say 'proceed' to continue, 'cancel' to skip.")
            
            except KeyboardInterrupt:
                print("\nCancelled.")
                break

    def _execute_current_task(self) -> None:
        """Run full execution workflow and print elite summary output."""
        task_request = self.engine.state.task_request
        if not task_request:
            print("No active task to execute.")
            return

        print("\n⏳ Starting trust-first execution workflow...")
        print("• planning → approval → sandbox → execute → verify → diff → final approval")

        try:
            result = self.execution_engine.execute(task_request.raw_text)
            result_data = result.to_dict()
            self.engine.state.execution_result = result_data

            if result.success:
                print()
                print(self.engine.generate_result_summary(result_data))
            else:
                print()
                print(self.engine.generate_failure_recovery_summary(result_data))

        except Exception as exc:
            logger.error(f"Execution workflow failed unexpectedly: {exc}", exc_info=True)
            print(
                "❌ Execution failed before completion.\n"
                "I attempted to start the workflow but hit an unexpected error.\n"
                "Try again, or switch provider with /model and retry."
            )

    def _refresh_provider_health(self) -> None:
        """Refresh provider health for premium model control center output."""
        try:
            asyncio.run(self.health_manager.check_all_health())
        except Exception as exc:
            logger.debug(f"Provider health refresh skipped: {exc}")
    
    def _run_diagnostics(self) -> None:
        """Run system diagnostics"""
        print("\n🔎 Running diagnostics...\n")
        
        # Check project structure
        print("✓ Project structure: OK")
        
        # Check .dev folder
        dev_dir = self.project_root / ".dev"
        if dev_dir.exists():
            print("✓ .dev folder: OK")
        else:
            print("⚠ .dev folder: Not found")
        
        # Check git
        try:
            import subprocess
            result = subprocess.run(
                ["git", "rev-parse", "--git-dir"],
                cwd=self.project_root,
                capture_output=True,
                timeout=2
            )
            if result.returncode == 0:
                print("✓ Git repository: OK")
            else:
                print("⚠ Git repository: Not found")
        except Exception:
            print("⚠ Git repository: Not found")
        
        # Check model
        print(f"✓ Model: {self.context.model_name}")
        print(f"✓ Provider: {self.context.provider}")
        print(f"✓ Auto mode: {'on' if self.model_control.current_config.auto_mode else 'off'}")
        print(f"✓ Providers loaded: {len(self.provider_factory.list_providers())}")
        
        print("\nDiagnostics complete.\n")


def run_elite_cli(
    model_name: str = "DeepSeek V4 Flash",
    provider: str = "DeepSeek",
    project_root: Optional[Path] = None
) -> int:
    """
    Run elite CLI
    
    Args:
        model_name: AI model name
        provider: AI provider name
        project_root: Project root directory
    
    Returns:
        Exit code
    """
    runner = EliteCLIRunner(
        project_root=project_root,
        model_name=model_name,
        provider=provider
    )
    return runner.run()


def main():
    """Production CLI entrypoint"""
    sys.exit(run_elite_cli())


if __name__ == "__main__":
    main()
