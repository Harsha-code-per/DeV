from pathlib import Path
import subprocess
import uuid


class WorktreeManager:
    def __init__(self, base_path="."):
        self.base_path = Path(base_path).resolve()

    def create_worktree(self, task_name: str):
        safe_name = task_name.lower().replace(" ", "-")
        unique_id = str(uuid.uuid4())[:8]

        branch_name = f"dev/{safe_name}-{unique_id}"
        worktree_path = self.base_path.parent / f"{safe_name}-{unique_id}"

        print(f"\nCreating sandbox worktree...")
        print(f"Branch: {branch_name}")
        print(f"Path: {worktree_path}")

        subprocess.run(
            [
                "git",
                "worktree",
                "add",
                "-b",
                branch_name,
                str(worktree_path)
            ],
            check=True
        )

        return {
            "branch": branch_name,
            "path": str(worktree_path)
        }