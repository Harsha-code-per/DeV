import unittest

from duration import parse_duration


class ParseDurationTest(unittest.TestCase):
    def test_valid(self):
        cases = {
            "45s": 45,
            "2d": 172800,
            "1h30m": 5400,
            "1d2h3m4s": 93784,
            " 1h  15m ": 4500,
            "2d 4h": 187200,
            "90": 90,
            "0s": 0,
            "0": 0,
            "100m": 6000,
            "1h 0m 1s": 3601,
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                result = parse_duration(text)
                self.assertEqual(result, expected)
                self.assertIsInstance(result, int)

    def test_invalid(self):
        for text in ["", "   ", "1x", "h", "1.5h", "-5s", "1m1h", "1h1h", "1 h", "1h30", "s5", "1hm", "abc", "1d 2d"]:
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    parse_duration(text)


if __name__ == "__main__":
    unittest.main()
