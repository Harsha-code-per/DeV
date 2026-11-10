import unittest

from tally import parse_scores


class ParseScores(unittest.TestCase):
    def test_pairs(self):
        self.assertEqual(parse_scores("ana:3, bo:5"), {"ana": 3, "bo": 5})


if __name__ == "__main__":
    unittest.main()
