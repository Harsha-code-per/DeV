from app.tools.terminal import SafeTerminalExecutor


class VerificationEngine:
    def __init__(self):
        self.executor = SafeTerminalExecutor()

    def run_checks(self):
        checks = [
            "python -m compileall app",
            "git status"
        ]

        results = []

        for check in checks:
            print(f"\nRunning: {check}\n")

            result = self.executor.run(check)

            results.append({
                "command": check,
                "success": result["success"],
                "output": result["output"]
            })

        return results