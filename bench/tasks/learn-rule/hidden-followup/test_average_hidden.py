import unittest

from tally import average


class Average(unittest.TestCase):
    def test_mean(self):
        self.assertEqual(average({"ana": 3, "bo": 6}), 4.5)

    def test_float(self):
        self.assertIsInstance(average({"ana": 2}), float)

    def test_empty_follows_the_project_rule(self):
        with self.assertRaises(ValueError) as caught:
            average({})
        self.assertTrue(str(caught.exception).startswith("tally: "), str(caught.exception))
