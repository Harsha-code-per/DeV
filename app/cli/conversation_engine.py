"""
Conversation Engine

Orchestrates the full elite CLI workflow:
- Task classification and routing
- Memory retrieval and context
- SMALL vs LARGE task decision
- Markdown plan workflow
- Approval conversation
- ExecutionEngine orchestration
- Result summaries
- Diff review UX
- Failure recovery
"""

from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List
from dataclasses import dataclass, field

from app.cli.elite_models import (
    TaskType, TaskSize, NaturalTaskRequest, 
    ImplementationPlan, ApprovalRequest, ExecutionContext
)
from app.cli.intent_detector import Intent, IntentDetector
from app.cli.task_classifier import TaskClassifier
from app.cli.dev_manager import DevFolderManager
from app.cli.plan_builder import MarkdownPlanBuilder
from app.cli.context_display import ContextDisplay
from app.models.multi_provider_system import (
    FallbackRouter,
    HealthManager,
    TaskType as ModelTaskType,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ConversationState:
    """Current conversation state"""
    task_request: Optional[NaturalTaskRequest] = None
    plan: Optional[ImplementationPlan] = None
    plan_file: Optional[Path] = None
    execution_context: Optional[ExecutionContext] = None
    approval_granted: bool = False
    execution_result: Optional[Dict[str, Any]] = None
    in_approval_workflow: bool = False
    model_routes: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    current_intent: Optional[str] = None


class ConversationEngine:
    """Orchestrate elite CLI conversation workflow"""
    
    def __init__(
        self,
        project_root: Path,
        intent_detector: Optional[IntentDetector] = None,
        provider_router: Optional[FallbackRouter] = None,
        health_manager: Optional[HealthManager] = None,
    ):
        """Initialize conversation engine"""
        self.project_root = project_root
        self.dev_manager = DevFolderManager(project_root)
        self.classifier = TaskClassifier()
        self.plan_builder = MarkdownPlanBuilder(project_root / ".dev")
        self.context_display = ContextDisplay()
        self.intent_detector = intent_detector or IntentDetector()
        self.provider_router = provider_router
        self.health_manager = health_manager
        self.state = ConversationState()
        
        # Ensure .dev structure
        self.dev_manager.ensure_dev_structure()

    def process_user_input(
        self,
        user_input: str,
        memory_engine=None,
    ) -> Tuple[str, str]:
        """
        Process raw user input through intent detection first.

        Returns:
            (message_type, message)
        """
        intent_result = self.intent_detector.detect(user_input)
        self.state.current_intent = intent_result.intent.value

        if intent_result.intent == Intent.COMMAND:
            return ("command", user_input)

        return self.process_natural_task(user_input, memory_engine=memory_engine)
    
    def process_natural_task(
        self, 
        user_input: str,
        memory_engine=None
    ) -> Tuple[str, str]:
        """
        Process natural language task
        
        Returns:
            (message_type: "small_task" | "large_task" | "error", message: str)
        """
        try:
            classification_route = self._route_for_stage(ModelTaskType.CLASSIFICATION)
            self.state.model_routes["classification"] = classification_route

            # Classify task
            request = self.classifier.classify(user_input)
            self.state.task_request = request
            
            logger.debug(f"Classified task: {request.task_type.value}, {request.task_size.value}")

            task_route_type = (
                ModelTaskType.PLANNING
                if request.task_size == TaskSize.LARGE
                else self._task_type_to_model_route(request.task_type)
            )
            self.state.model_routes["task"] = self._route_for_stage(task_route_type)
            
            # Retrieve relevant memory if available
            context_info = ""
            if memory_engine and hasattr(memory_engine, 'retrieve_for_task'):
                try:
                    memory_result = memory_engine.retrieve_for_task(
                        user_input,
                        request.task_type
                    )
                    if memory_result and memory_result.entries:
                        context_info = f"\n[Retrieved {len(memory_result.entries)} relevant patterns from project memory]"
                except Exception as e:
                    logger.warning(f"Error retrieving memory: {e}")

            route_details = self._format_route_details()
            if route_details:
                context_info = f"{context_info}\n{route_details}".strip()
            
            # Route based on task size
            if request.task_size == TaskSize.SMALL:
                return ("small_task", self._handle_small_task(request, context_info))
            else:
                return ("large_task", self._handle_large_task(request, context_info))
        
        except Exception as e:
            logger.error(f"Error processing task: {e}")
            return ("error", f"Error processing task: {str(e)}")
    
    def _handle_small_task(
        self, 
        request: NaturalTaskRequest,
        context_info: str = ""
    ) -> str:
        """Handle small task (< 30 minutes)"""
        
        # Create execution context
        self.state.execution_context = ExecutionContext(
            task_request=request,
            project_root=self.project_root,
            dev_dir=self.project_root / ".dev"
        )
        
        likely_work = self._infer_likely_work(request)
        likely_files = self._infer_likely_files(request)
        verification_plan = self._infer_verification_plan(request)
        risk_level = self._estimate_risk_level(request)
        browser_plan = (
            "• Browser login/flow validation via Playwright"
            if self._needs_browser_validation(request)
            else "• Browser validation not required for this task"
        )

        summary = f"""
I inspected your request{f"\\n\\n{context_info}" if context_info else ""}.

**Task**: {request.raw_text}
**Type**: {request.task_type.value}
**Complexity**: Small task (~30 minutes)
**Confidence**: {request.confidence:.0%}

**Likely work**:
{chr(10).join(f"• {item}" for item in likely_work)}

**Files likely affected**:
{chr(10).join(f"• {item}" for item in likely_files)}

**Why changes are needed**:
• Resolve the reported engineering issue with minimal, safe edits
• Preserve existing behavior outside the affected workflow

**Verification plan**:
{chr(10).join(f"• {item}" for item in verification_plan)}
{browser_plan}

**Risk**:
{risk_level}

I'll work inside an isolated sandbox and show all changes before applying.

**Ready to proceed?** (yes/no/cancel)
"""
        
        self.state.in_approval_workflow = True
        return summary
    
    def _handle_large_task(
        self, 
        request: NaturalTaskRequest,
        context_info: str = ""
    ) -> str:
        """Handle large task (> 30 minutes) - create markdown plan"""
        
        # Create execution context
        self.state.execution_context = ExecutionContext(
            task_request=request,
            project_root=self.project_root,
            dev_dir=self.project_root / ".dev"
        )
        
        # Generate basic implementation plan
        plan = self._generate_implementation_plan(request)
        self.state.plan = plan
        
        # Save plan
        if self.plan_builder.build_and_save(plan):
            self.state.plan_file = self.plan_builder.plans_dir / plan.filename
            
            # Return message with plan reference
            summary = f"""
I created a detailed implementation plan for your request{f"\\n\\n{context_info}" if context_info else ""}.

**Task**: {request.raw_text}
**Type**: {request.task_type.value}
**Complexity**: Large task (> 30 minutes)
**Confidence**: {request.confidence:.0%}

📋 **Plan saved**: `.dev/plans/{plan.filename}`

**Review the plan**:
1. Read `.dev/plans/{plan.filename}`
2. Edit if needed
3. Continue by saying "I reviewed the plan, proceed." or use @file reference

You can also reference the plan with:
`@{Path(plan.filename).stem}`

**What to check in the plan**:
✓ Proposed approach makes sense
✓ Affected files are correct
✓ Risk level is acceptable
✓ Verification steps are comprehensive
"""
            
            self.state.in_approval_workflow = False
            return summary
        else:
            return "Error: Failed to create implementation plan"

    def _route_for_stage(self, stage: ModelTaskType) -> Dict[str, Any]:
        """Select provider/model route for a workflow stage."""
        if not self.provider_router:
            return {
                "provider": "unavailable",
                "model": "unavailable",
                "reason": "Router not configured",
                "task_type": stage.value,
            }

        route = self.provider_router.route(stage)
        return {
            "provider": route.provider_id,
            "model": route.model_name,
            "reason": route.reason,
            "task_type": stage.value,
            "fallback_chain": route.fallback_chain,
        }

    def _task_type_to_model_route(self, task_type: TaskType) -> ModelTaskType:
        """Map CLI task types to multi-provider route types."""
        if task_type in {TaskType.BUG_FIX, TaskType.REFACTOR, TaskType.FEATURE}:
            return ModelTaskType.CODING
        if task_type == TaskType.INVESTIGATION:
            return ModelTaskType.INVESTIGATION
        if task_type == TaskType.TEST:
            return ModelTaskType.BROWSER_TESTING
        return ModelTaskType.DEFAULT

    def _format_route_details(self) -> str:
        """Format selected model routes for user-visible trust UX."""
        if not self.state.model_routes:
            return ""

        lines = ["**Model routing**:"]
        classification_route = self.state.model_routes.get("classification")
        task_route = self.state.model_routes.get("task")

        if classification_route:
            lines.append(
                "• classification → "
                f"{classification_route.get('provider')} / {classification_route.get('model')}"
            )
        if task_route:
            lines.append(
                f"• {task_route.get('task_type', 'task')} → "
                f"{task_route.get('provider')} / {task_route.get('model')}"
            )
            fallback_chain = task_route.get("fallback_chain") or []
            if fallback_chain:
                fallback_display = " → ".join(f"{provider}/{model}" for provider, model in fallback_chain[:3])
                lines.append(f"• fallback chain: {fallback_display}")

        return "\n".join(lines)

    def _infer_likely_work(self, request: NaturalTaskRequest) -> List[str]:
        """Generate concise likely-work bullets."""
        if request.task_type == TaskType.BUG_FIX:
            return [
                "inspect failing module and reproduction path",
                "implement a focused fix in sandbox",
                "verify with existing tests/build checks",
            ]
        if request.task_type == TaskType.INVESTIGATION:
            return [
                "trace failure path and root cause",
                "validate findings with logs/tests",
                "propose minimal remediation options",
            ]
        if request.task_type == TaskType.REFACTOR:
            return [
                "identify safe refactor boundaries",
                "apply behavior-preserving structural updates",
                "run regression checks before apply",
            ]
        return [
            "inspect related modules and constraints",
            "implement scoped changes in sandbox",
            "verify and prepare diff review",
        ]

    def _infer_likely_files(self, request: NaturalTaskRequest) -> List[str]:
        """Infer likely affected files for approval UX."""
        keywords = set(request.keywords)
        likely_files: List[str] = []
        if "auth" in keywords or "login" in keywords:
            likely_files.extend(["auth.py", "login.tsx"])
        if "build" in keywords or "production" in keywords:
            likely_files.extend(["pyproject.toml", "build config"])
        if "test" in keywords:
            likely_files.append("tests/*")
        if not likely_files:
            likely_files = ["affected source modules", "related tests"]
        return likely_files[:4]

    def _infer_verification_plan(self, request: NaturalTaskRequest) -> List[str]:
        """Infer verification bullets for approval UX."""
        checks = ["run relevant existing tests", "validate no regressions"]
        if request.task_type in {TaskType.BUG_FIX, TaskType.FEATURE}:
            checks.insert(0, "reproduce issue before and after change")
        return checks

    def _needs_browser_validation(self, request: NaturalTaskRequest) -> bool:
        """Detect when browser workflow validation is likely needed."""
        raw = request.raw_text.lower()
        browser_tokens = ("frontend", "ui", "login flow", "browser", "route", "form")
        return any(token in raw for token in browser_tokens)

    def _estimate_risk_level(self, request: NaturalTaskRequest) -> str:
        """Estimate risk level for approval messaging."""
        if request.task_size == TaskSize.LARGE:
            return "MEDIUM"
        if request.task_type in {TaskType.DEPLOYMENT, TaskType.REFACTOR}:
            return "MEDIUM"
        return "LOW"
    
    def _generate_implementation_plan(
        self, 
        request: NaturalTaskRequest
    ) -> ImplementationPlan:
        """Generate basic implementation plan from task request"""
        
        # Create intelligent hypothesis based on task type
        hypothesis = self._generate_hypothesis(request)
        
        # Generate estimated time based on size
        estimated_time = 120 if request.task_size == TaskSize.LARGE else 60
        
        return ImplementationPlan(
            task_description=request.raw_text,
            task_type=request.task_type,
            hypothesis=hypothesis,
            affected_files=self._infer_likely_files(request),
            proposed_changes=self._infer_likely_work(request),
            risks=[f"Risk level: {self._estimate_risk_level(request)}"],
            verification_steps=[
                "Run existing test suite",
                "Verify functionality",
                "Check for regressions",
                "Review diff before apply",
            ],
            estimated_time_minutes=estimated_time
        )
    
    def _generate_hypothesis(self, request: NaturalTaskRequest) -> str:
        """Generate intelligent hypothesis based on task"""
        
        if request.task_type == TaskType.BUG_FIX:
            return f"Issue likely stems from: {request.raw_text[:50]}... Will investigate affected modules."
        
        elif request.task_type == TaskType.FEATURE:
            return f"Need to implement: {request.raw_text[:50]}... Will design around existing architecture."
        
        elif request.task_type == TaskType.REFACTOR:
            return f"Goal: improve code by {request.raw_text[:50]}... Will reorganize while preserving behavior."
        
        elif request.task_type == TaskType.INVESTIGATION:
            return f"Investigating: {request.raw_text[:50]}... Will analyze and explain findings."
        
        else:
            return f"Working on: {request.raw_text[:50]}..."
    
    def handle_approval_response(self, user_response: str) -> Tuple[str, Optional[str]]:
        """
        Handle user approval response
        
        Returns:
            (message: str, action: "execute" | "cancel" | "revise" | None)
        """
        response_lower = user_response.lower().strip()
        
        if response_lower in ["yes", "proceed", "ok", "approved"]:
            return ("✅ Approval granted. Starting execution...", "execute")
        
        elif response_lower in ["no", "cancel", "skip", "abort"]:
            self.state.approval_granted = False
            self.state.in_approval_workflow = False
            return ("Execution cancelled. What else can I help with?", "cancel")
        
        elif response_lower in ["review", "show plan", "@plan", "edit"]:
            if self.state.plan_file:
                try:
                    content = self.state.plan_file.read_text()
                    return (f"**Plan content**:\n\n{content}\n\nAfter review, say 'proceed'.", None)
                except Exception as e:
                    return (f"Error reading plan: {e}", None)
            else:
                return ("No plan available", None)
        
        else:
            return (
                "I didn't understand that. Please say: yes/proceed (approve), no/cancel (decline), or review (show plan).",
                None
            )
    
    def load_file_reference(self, file_ref: str) -> Optional[str]:
        """
        Load @file reference
        
        Args:
            file_ref: Reference like "auth-plan" or "error.log"
        
        Returns:
            File content or None
        """
        try:
            # Remove @ if present
            if file_ref.startswith("@"):
                file_ref = file_ref[1:]
            
            # Search in .dev folder
            search_paths = [
                self.project_root / ".dev" / "plans" / f"{file_ref}.md",
                self.project_root / ".dev" / "plans" / file_ref,
                self.project_root / ".dev" / "logs" / file_ref,
                self.project_root / ".dev" / file_ref,
            ]
            
            for path in search_paths:
                if path.exists():
                    return path.read_text()
            
            logger.warning(f"File reference not found: {file_ref}")
            return None
        
        except Exception as e:
            logger.error(f"Error loading file reference: {e}")
            return None
    
    def generate_result_summary(
        self,
        execution_result: Dict[str, Any]
    ) -> str:
        """
        Generate beautiful result summary after execution
        
        Args:
            execution_result: Result from ExecutionEngine
        
        Returns:
            Summary message
        """
        try:
            success = execution_result.get("success")
            if success is False:
                return self.generate_failure_recovery_summary(execution_result)

            diff = execution_result.get("diff") or {}
            verification_result = execution_result.get("verification") or {}
            patch_summary = execution_result.get("patch_summary") or {}
            metadata = execution_result.get("metadata") or {}

            changed_files = (
                diff.get("files_changed")
                or execution_result.get("changed_files")
                or []
            )

            summary_lines = ["✅ **Execution completed successfully.**", ""]

            if patch_summary:
                root_cause = patch_summary.get("root_cause_found") or patch_summary.get("root_cause")
                if root_cause:
                    summary_lines.append(f"**Why it changed**: {root_cause}")

            summary_lines.append(f"**What changed**: {len(changed_files)} file(s)")
            for changed_file in changed_files[:8]:
                summary_lines.append(f"• {changed_file}")
            if len(changed_files) > 8:
                summary_lines.append(f"• ... and {len(changed_files) - 8} more")

            insertions = diff.get("insertions")
            deletions = diff.get("deletions")
            if insertions is not None and deletions is not None:
                summary_lines.append(f"\n**Diff review summary**: +{insertions} / -{deletions}")

            verification_success = verification_result.get("success")
            if verification_success is True:
                summary_lines.append("**Verification result**: passed")
            elif verification_success is False:
                summary_lines.append("**Verification result**: failed")
            elif verification_result:
                summary_lines.append("**Verification result**: completed")

            browser_result = metadata.get("browser_validation")
            if browser_result:
                summary_lines.append(f"**Browser verification**: {browser_result}")
            else:
                summary_lines.append("**Browser verification**: not required")

            stage = execution_result.get("stage", "")
            if stage == "complete":
                summary_lines.append("**Final approval**: applied after approval gates")
            else:
                summary_lines.append("**Final approval**: pending")

            return "\n".join(summary_lines)
        
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            return "Execution completed. See logs for details."

    def generate_failure_recovery_summary(self, execution_result: Dict[str, Any]) -> str:
        """Generate trust-first failure summary with next options."""
        stage = execution_result.get("stage", "unknown")
        error_message = execution_result.get("error_message", "Unknown failure")
        attempted = []

        if execution_result.get("plan"):
            attempted.append("generated implementation plan")
        if execution_result.get("diff"):
            attempted.append("prepared diff review")
        if execution_result.get("verification"):
            attempted.append("ran verification checks")
        if not attempted:
            attempted.append("started workflow execution")

        attempted_text = "\n".join(f"• {item}" for item in attempted)

        return (
            "❌ **Execution could not complete.**\n\n"
            f"**What failed**: {stage}\n"
            f"**Error**: {error_message}\n\n"
            "**What was attempted**:\n"
            f"{attempted_text}\n\n"
            "**Likely next options**:\n"
            "• adjust task scope and retry\n"
            "• provide additional context/logs\n"
            "• switch model/provider with `/model` and retry"
        )
    
    def get_current_state_summary(self) -> str:
        """Get summary of current conversation state"""
        if not self.state.task_request:
            return "No active task"
        
        lines = [
            f"**Current Task**: {self.state.task_request.raw_text}",
            f"**Type**: {self.state.task_request.task_type.value}",
            f"**Size**: {self.state.task_request.task_size.value}",
        ]

        if self.state.current_intent:
            lines.append(f"**Intent**: {self.state.current_intent}")
        
        if self.state.plan_file:
            lines.append(f"**Plan**: {self.state.plan_file.name}")
        
        if self.state.approval_granted:
            lines.append("**Status**: Approved, executing")
        elif self.state.in_approval_workflow:
            lines.append("**Status**: Awaiting approval")
        
        return "\n".join(lines)
    
    def reset(self) -> None:
        """Reset conversation state for new task"""
        self.state = ConversationState()
