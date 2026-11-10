import unittest

from tally import top


class Top(unittest.TestCase):
    def test_highest_first(self):
        self.assertEqual(top({"ana": 3, "bo": 5, "cy": 4}, 2), [("bo", 5), ("cy", 4)])

    def test_ties_by_name(self):
        self.assertEqual(top({"zed": 5, "amy": 5, "bo": 1}), [("amy", 5), ("zed", 5), ("bo", 1)])

    def test_default_is_three(self):
        self.assertEqual(len(top({"a": 1, "b": 2, "c": 3, "d": 4})), 3)
