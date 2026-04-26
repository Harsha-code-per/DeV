import subprocess


class SafeTerminalExecutor:
    BLOCKED_COMMANDS = [
        "rm -rf",
        "sudo rm",
        "mkfs",
        "shutdown",
        "reboot",
        "poweroff",
        "dd if=",
        ":(){ :|:& };:"
    ]

    def is_safe(self, command: str) -> bool:
        for blocked in self.BLOCKED_COMMANDS:
            if blocked in command:
                return False
        return True

    def run(self, command: str):
        if not self.is_safe(command):
            return {
                "success": False,
                "output": "Blocked dangerous command."
            }

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True
            )

            return {
                "success": result.returncode == 0,
                "output": result.stdout or result.stderr
            }

        except Exception as e:
            return {
                "success": False,
                "output": str(e)
            }