import json
import os
import subprocess
import sys
import tempfile
import unittest


class TagsTest(unittest.TestCase):
    def setUp(self):
        handle, self.path = tempfile.mkstemp(suffix=".json")
        os.close(handle)
        os.unlink(self.path)
        self.addCleanup(lambda: os.path.exists(self.path) and os.unlink(self.path))

    def cli(self, *args):
        return subprocess.run(
            [sys.executable, "-m", "todo", "--file", self.path, *args], capture_output=True, text=True, timeout=30
        )

    def ok(self, *args):
        result = self.cli(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_add_with_tags_and_list(self):
        self.assertEqual(self.ok("add", "Buy milk", "--tag", "Home", "--tag", "errands", "--tag", "home"), "added 1\n")
        self.ok("add", "Plain task")
        self.assertEqual(self.ok("list"), "1. [ ] Buy milk #errands #home\n2. [ ] Plain task\n")

    def test_filter_requires_every_tag(self):
        self.ok("add", "a", "--tag", "x", "--tag", "y")
        self.ok("add", "b", "--tag", "x")
        self.ok("add", "c", "--tag", "y")
        self.ok("done", "1")
        self.assertEqual(self.ok("list", "--tag", "x"), "2. [ ] b #x\n")
        self.assertEqual(self.ok("list", "--all", "--tag", "X", "--tag", "y"), "1. [x] a #x #y\n")
        self.assertEqual(self.ok("list", "--tag", "nope"), "")

    def test_tag_and_untag(self):
        self.ok("add", "a", "--tag", "keep")
        self.assertEqual(self.ok("tag", "1", "Zed", "alpha", "keep"), "1. [ ] a #alpha #keep #zed\n")
        self.assertEqual(self.ok("untag", "1", "keep", "missing"), "1. [ ] a #alpha #zed\n")
        self.assertEqual(self.ok("list"), "1. [ ] a #alpha #zed\n")

    def test_tags_counts_open_tasks(self):
        self.ok("add", "a", "--tag", "work", "--tag", "urgent")
        self.ok("add", "b", "--tag", "work")
        self.ok("add", "c", "--tag", "home")
        self.ok("add", "d")
        self.ok("done", "3")
        self.assertEqual(self.ok("tags"), "urgent 1\nwork 2\n")

    def test_invalid_tags_change_nothing(self):
        self.ok("add", "a")
        before = open(self.path).read()
        for args in (["add", "b", "--tag", "bad tag"], ["add", "b", "--tag", "x!"], ["tag", "1", "ok", "no_underscore"], ["add", "b", "--tag", ""]):
            result = self.cli(*args)
            self.assertEqual(result.returncode, 2, args)
            self.assertNotEqual(result.stderr.strip(), "")
        self.assertEqual(open(self.path).read(), before)

    def test_unknown_id(self):
        for command in ("tag", "untag"):
            result = self.cli(command, "42", "x")
            self.assertEqual(result.returncode, 1)
            self.assertNotEqual(result.stderr.strip(), "")

    def test_old_files_still_load(self):
        with open(self.path, "w") as handle:
            json.dump({"next_id": 3, "tasks": [{"id": 1, "text": "old", "done": False}, {"id": 2, "text": "older", "done": True}]}, handle)
        self.assertEqual(self.ok("list", "--all"), "1. [ ] old\n2. [x] older\n")
        self.assertEqual(self.ok("tags"), "")
        self.assertEqual(self.ok("tag", "2", "archive"), "2. [x] older #archive\n")
        self.assertEqual(self.ok("add", "new"), "added 3\n")
        self.assertEqual(self.ok("list", "--all", "--tag", "archive"), "2. [x] older #archive\n")

    def test_tags_persist_in_file(self):
        self.ok("add", "a", "--tag", "b", "--tag", "a")
        with open(self.path) as handle:
            data = json.load(handle)
        self.assertEqual(sorted(data["tasks"][0]["tags"]), ["a", "b"])


if __name__ == "__main__":
    unittest.main()
