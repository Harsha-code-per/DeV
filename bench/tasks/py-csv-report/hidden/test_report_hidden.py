import os
import subprocess
import sys
import tempfile
import unittest


def run(*args):
    return subprocess.run([sys.executable, "report.py", *args], capture_output=True, text=True, timeout=30)


class ReportTest(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_sample(self):
        result = run("sales.csv")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["North: 140.00", "South: 140.00", "East: 99.99", "TOTAL: 379.99"])

    def test_sorting_and_spaces(self):
        path = self.write(
            "date,region,amount\n"
            "2026-02-01,West Coast,10.10\n"
            "2026-02-01,alpha,5\n"
            "2026-02-02,West Coast,0.20\n"
            "2026-02-03,Beta,10.30\n"
            "2026-02-03,beta,1.25\n"
        )
        result = run(path)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.splitlines(),
            ["Beta: 10.30", "West Coast: 10.30", "alpha: 5.00", "beta: 1.25", "TOTAL: 26.85"],
        )

    def test_header_only(self):
        result = run(self.write("date,region,amount\n"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["TOTAL: 0.00"])

    def test_missing_file(self):
        result = run("does-not-exist.csv")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertNotEqual(result.stderr.strip(), "")


if __name__ == "__main__":
    unittest.main()
