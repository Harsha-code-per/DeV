from app.core.planner import PlanningEngine
from app.core.executor import create_execution_engine, ExecutionStage
from app.config import AVAILABLE_MODELS, CURRENT_MODEL


class DeVCLI:
    def __init__(self):
        self.current_model = CURRENT_MODEL
        self.planner = PlanningEngine()
        self.executor = create_execution_engine()

    def show_models(self):
        print("\nCurrent Model:")
        print(self.current_model)

        print("\nAvailable Models:")

        for i, model in enumerate(
            AVAILABLE_MODELS,
            start=1
        ):
            print(f"{i}. {model}")

        choice = input(
            "\nChoose model number (or press Enter to cancel): "
        ).strip()

        if not choice:
            print("\nModel switch cancelled.\n")
            return

        try:
            index = int(choice) - 1

            if index < 0 or index >= len(AVAILABLE_MODELS):
                print("\nInvalid selection.\n")
                return

            self.current_model = AVAILABLE_MODELS[index]

            from app.models.provider_factory import get_provider
            from app.config import CURRENT_PROVIDER

            self.planner.provider = get_provider(
            CURRENT_PROVIDER,
            self.current_model
            )

            print(
                f"\nModel switched to: {self.current_model}\n"
            )

        except ValueError:
            print("\nInvalid input.\n")

    def _format_stage_progress(self, stage: ExecutionStage) -> str:
        """Format execution stage for display."""
        stage_names = {
            ExecutionStage.PLANNING: "📋 Planning",
            ExecutionStage.PLAN_APPROVAL: "✓ Plan Review",
            ExecutionStage.SANDBOX_CREATION: "🏗️  Sandbox Creation",
            ExecutionStage.EXECUTION: "⚙️  Execution",
            ExecutionStage.VERIFICATION: "✅ Verification",
            ExecutionStage.DIFF_GENERATION: "📊 Diff Generation",
            ExecutionStage.DIFF_REVIEW: "👀 Diff Review",
            ExecutionStage.FINAL_APPROVAL: "🔒 Final Approval",
            ExecutionStage.APPLYING: "📝 Applying Changes",
            ExecutionStage.COMPLETE: "✓ Complete",
            ExecutionStage.FAILED: "✗ Failed",
        }
        return stage_names.get(stage, stage.value)

    def _display_execution_progress(self, result) -> None:
        """Display execution progress and results."""
        print("\n" + "="*70)
        print("EXECUTION PROGRESS & RESULTS")
        print("="*70)

        # Task and plan
        print(f"\nTask: {result.task}")
        
        if result.plan:
            print(f"\nImplementation Plan:\n{result.plan}")

        # Current stage
        print(f"\nCurrent Stage: {self._format_stage_progress(result.stage)}")

        # Verification results
        if result.verification:
            print("\nVerification Results:")
            print(f"  Status: {'✓ PASSED' if result.verification.success else '✗ FAILED'}")
            print(f"  Checks Run: {len(result.verification.checks_run)}")
            
            if result.verification.errors:
                print("  Errors:")
                for error in result.verification.errors:
                    print(f"    - {error}")

        # Diff summary
        if result.diff:
            print("\nChanges Made:")
            print(f"  Files Changed: {len(result.diff.files_changed)}")
            print(f"  Lines: +{result.diff.insertions}/-{result.diff.deletions}")
            print(f"  Branch: {result.diff.branch_name}")
            print(f"  Sandbox: {result.diff.sandbox_path}")
            
            if result.diff.files_changed:
                print("\n  Modified Files:")
                for file in result.diff.files_changed[:5]:
                    print(f"    - {file}")
                if len(result.diff.files_changed) > 5:
                    print(f"    ... and {len(result.diff.files_changed) - 5} more")

        # Final status
        print("\n" + "="*70)
        if result.success:
            print("✓ EXECUTION SUCCESSFUL")
        else:
            if result.error_message:
                print(f"✗ EXECUTION FAILED: {result.error_message}")
            else:
                print("✗ EXECUTION FAILED")
        print("="*70 + "\n")

    def execute_task(self):
        """Execute the full engineering workflow."""
        task = input(
            "\nWhat should DeV execute?\n> "
        ).strip()

        if task == "/exit":
            print("\nExiting DeV...\n")
            return "exit"

        elif task == "/cancel":
            print("\nExecution cancelled.\n")
            return "continue"

        elif task == "":
            print("\nEmpty task. Try again.\n")
            return "continue"

        # Execute the full workflow
        print("\n" + "="*70)
        print("STARTING EXECUTION WORKFLOW")
        print("="*70)
        
        result = self.executor.execute(task)

        # Display results
        self._display_execution_progress(result)

        return "continue"

    def start(self):
        print(
            f"\nDeV Interactive CLI Started "
            f"(Model: {self.current_model})"
        )
        print("Type /exit to quit")
        print("Type /help for commands\n")

        while True:
            command = input("DeV > ").strip()

            if command == "/exit":
                print("\nExiting DeV...\n")
                break

            elif command == "/help":
                print("""
Available Commands:

/help      → show commands
/exit      → quit
/cancel    → cancel current action
/model     → switch model
/plan      → implementation planning
/execute   → full engineering execution workflow
""")

            elif command == "/model":
                self.show_models()

            elif command == "/plan":
                task = input(
                    "\nWhat should DeV plan?\n> "
                ).strip()

                if task == "/exit":
                    print("\nExiting DeV...\n")
                    break

                elif task == "/cancel":
                    print("\nPlan cancelled.\n")
                    continue

                elif task == "":
                    print("\nEmpty task. Try again.\n")
                    continue

                plan = self.planner.create_plan(task)

                print("\nImplementation Plan:\n")
                print(plan)

            elif command == "/execute":
                result = self.execute_task()
                if result == "exit":
                    break
                continue

            else:
                print(
                    "\nUnknown command. Type /help\n"
                )