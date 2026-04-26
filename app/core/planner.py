from app.models.provider_factory import get_provider
from app.config import CURRENT_PROVIDER, CURRENT_MODEL

class PlanningEngine:
    def __init__(self):
        self.provider = get_provider(
            CURRENT_PROVIDER,
            CURRENT_MODEL
        )

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

        return self.provider.generate(planning_prompt)