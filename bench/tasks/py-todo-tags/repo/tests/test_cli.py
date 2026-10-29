import os
import subprocess
import sys
import tempfile
import unittest


class CliTest(unittest.TestCase):
    def setUp(self):
        handle, self.path = tempfile.mkstemp(suffix=".json")
        os.close(handle)
        os.unlink(self.path)
        self.addCleanup(lambda: os.path.exists(self.path) and os.unlink(self.path))

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-m", "todo", "--file", self.path, *args], capture_output=True, text=True, timeout=30
        )

    def test_add_list_done(self):
        self.assertEqual(self.run_cli("add", "Buy milk").stdout, "added 1\n")
        self.assertEqual(self.run_cli("add", "Write report").stdout, "added 2\n")
        self.assertEqual(self.run_cli("done", "1").returncode, 0)
        self.assertEqual(self.run_cli("list").stdout, "2. [ ] Write report\n")
        self.assertEqual(self.run_cli("list", "--all").stdout, "1. [x] Buy milk\n2. [ ] Write report\n")

    def test_done_unknown(self):
        result = self.run_cli("done", "9")
        self.assertEqual(result.returncode, 1)
        self.assertIn("no task 9", result.stderr)


if __name__ == "__main__":
    unittest.main()
