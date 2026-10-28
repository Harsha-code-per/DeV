import asyncio
from typing import Optional

from app.config import CURRENT_MODEL, CURRENT_PROVIDER
from app.models.multi_provider_system import (
    FallbackRouter,
    HealthManager,
    TaskType as ModelTaskType,
)
from app.models.provider_factory import get_provider
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class PlanningEngine:
    def __init__(
        self,
        router: Optional[FallbackRouter] = None,
        health_manager: Optional[HealthManager] = None,
    ):
        self.router = router
        self.health_manager = health_manager
        try:
            self.provider = get_provider(
                CURRENT_PROVIDER,
                CURRENT_MODEL
            )
        except Exception as exc:
            logger.warning(f"Legacy provider init failed, planner will rely on multi-provider routing: {exc}")
            self.provider = None

    def create_plan(self, task: str) -> str:
        planning_prompt = f'''
You are an elite senior software engineer.

Your job is NOT to write code first.

Your job is to create a professional implementation plan before coding.

Task:
{task}

Return:
1. Understanding of the task
2. Implementation steps
3. Files likely to change
4. Risks and edge cases
5. Verification steps required

Be concise, professional, and production-focused.
'''

        if self.router and self.health_manager:
            route = self.router.route(ModelTaskType.PLANNING)
            if route.provider_id != "error":
                try:
                    success, response = asyncio.run(
                        self.health_manager.execute_with_fallback(
                            route=route,
                            prompt=planning_prompt,
                            temperature=0.2,
                            max_tokens=1200,
                        )
                    )
                    if success:
                        return response
                    logger.warning(f"Planning fallback chain exhausted: {response}")
                except Exception as exc:
                    logger.warning(f"Planning via multi-provider failed: {exc}")

        if self.provider is not None:
            return self.provider.generate(planning_prompt)

        return (
            "Implementation plan:\n"
            "1. Understand the root issue and reproduction path.\n"
            "2. Identify minimal, safe code changes in affected modules.\n"
            "3. Implement in isolated sandbox with focused edits.\n"
            "4. Verify with existing tests/build checks.\n"
            "5. Review diff and apply only after approval."
        )
