import json
import os
import subprocess
import sys
import tempfile
import unittest


def run(*args, stdin=""):
    return subprocess.run([sys.executable, "stats.py", *args], input=stdin, capture_output=True, text=True, timeout=30)


def ok(*args, stdin=""):
    result = run(*args, stdin=stdin)
    if result.returncode != 0:
        raise AssertionError(f"exit {result.returncode}: {result.stderr}")
    return json.loads(result.stdout)


class StatsTest(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".log", delete=False)
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def test_sample(self):
        self.assertEqual(
            ok("access.log"),
            {
                "requests": 7,
                "malformed": 1,
                "status": {"2xx": 5, "3xx": 0, "4xx": 1, "5xx": 1},
                "endpoints": [
                    {"endpoint": "GET /api/users", "count": 3, "p50": 80, "p95": 120, "errors": 0},
                    {"endpoint": "GET /api/orders", "count": 2, "p50": 90, "p95": 1500, "errors": 1},
                    {"endpoint": "GET /health", "count": 1, "p50": 2, "p95": 2, "errors": 0},
                    {"endpoint": "POST /api/users", "count": 1, "p50": 300, "p95": 300, "errors": 0},
                ],
            },
        )

    def test_percentiles_nearest_rank(self):
        lines = "".join(f"2026-10-01T00:00:{i:02d}Z GET /p 200 {d}ms\n" for i, d in enumerate(range(100, 0, -5)))
        stats = ok(stdin=lines)
        self.assertEqual(stats["endpoints"], [{"endpoint": "GET /p", "count": 20, "p50": 50, "p95": 95, "errors": 0}])
        two = ok(stdin="2026-10-01T00:00:00Z GET /q 200 10ms\n2026-10-01T00:00:01Z GET /q 503 30ms\n")
        self.assertEqual(two["endpoints"][0], {"endpoint": "GET /q", "count": 2, "p50": 10, "p95": 30, "errors": 1})

    def test_top_and_ties(self):
        text = "".join(
            f"2026-10-01T00:00:00Z {m} {p} 200 1ms\n"
            for m, p in [("GET", "/b"), ("GET", "/a"), ("POST", "/a"), ("GET", "/c"), ("GET", "/c"), ("DELETE", "/z")]
        )
        stats = ok("--top", "3", stdin=text)
        self.assertEqual([e["endpoint"] for e in stats["endpoints"]], ["GET /c", "DELETE /z", "GET /a"])
        self.assertEqual(len(ok(stdin=text)["endpoints"]), 5)

    def test_since_compares_moments(self):
        text = (
            "2026-10-01T10:00:00+02:00 GET /a 200 1ms\n"  # 08:00Z
            "2026-10-01T08:30:00Z GET /a 200 1ms\n"
            "2026-10-01T07:59:59Z GET /a 200 1ms\n"
            "nonsense\n"
        )
        stats = ok("--since", "2026-10-01T09:00:00+01:00", stdin=text)
        self.assertEqual(stats["requests"], 2)
        self.assertEqual(stats["malformed"], 1)

    def test_malformed_rules(self):
        text = (
            "2026-10-01T00:00:00Z GET /ok 204 5ms\n"
            "2026-10-01T00:00:00Z GET /ok 204 5\n"
            "2026-10-01T00:00:00Z GET /ok 2O4 5ms\n"
            "2026-10-01T00:00:00Z GET /ok 600 5ms\n"
            "2026-10-01T00:00:00Z GET /ok 204 5.5ms\n"
            "2026-13-01T00:00:00Z GET /ok 204 5ms\n"
            "2026-10-01T00:00:00Z GET /ok 204 5ms extra\n"
            "2026-10-01T00:00:00Z GET  /ok 204 5ms\n"
            "\n"
            "   \n"
            "2026-10-01T00:00:00Z GET /ok 101 5ms\n"
            "2026-10-01T00:00:00Z GET /moved 301 7ms\n"
        )
        stats = ok(stdin=text)
        self.assertEqual(stats["requests"], 3)
        self.assertEqual(stats["malformed"], 7)
        self.assertEqual(stats["status"], {"2xx": 1, "3xx": 1, "4xx": 0, "5xx": 0})

    def test_several_files_and_dash(self):
        a = self.write("2026-10-01T00:00:00Z GET /a 200 1ms\n")
        b = self.write("2026-10-01T00:00:00Z GET /a 500 3ms\n")
        stats = ok(a, "-", b, stdin="2026-10-01T00:00:00Z GET /a 200 2ms\n")
        self.assertEqual(stats["endpoints"], [{"endpoint": "GET /a", "count": 3, "p50": 2, "p95": 3, "errors": 1}])

    def test_empty_input(self):
        self.assertEqual(
            ok(stdin=""), {"requests": 0, "malformed": 0, "status": {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}, "endpoints": []}
        )

    def test_errors(self):
        missing = run("does-not-exist.log")
        self.assertEqual(missing.returncode, 1)
        self.assertEqual(missing.stdout, "")
        self.assertNotEqual(missing.stderr.strip(), "")
        self.assertEqual(run("--top", "0", "access.log").returncode, 2)
        self.assertEqual(run("--top", "x", "access.log").returncode, 2)
        self.assertEqual(run("--since", "yesterday", "access.log").returncode, 2)


if __name__ == "__main__":
    unittest.main()
