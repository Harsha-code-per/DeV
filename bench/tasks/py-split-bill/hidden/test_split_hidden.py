import unittest
from decimal import Decimal

from split import split


class SplitTest(unittest.TestCase):
    def assertAddsUp(self, total, shares):
        self.assertEqual(sum(Decimal(s) for s in shares), Decimal(total))
        for share in shares:
            self.assertRegex(share, r"^\d+\.\d\d$")

    def test_three_ways(self):
        self.assertEqual(split("100.00", [1, 1, 1]), ["33.34", "33.33", "33.33"])

    def test_largest_remainder_not_first_person(self):
        # 1000 cents by 1:2:3 -> 166.67, 333.33, 500 -> floors 166, 333, 500, one cent left to the 166.67 person
        self.assertEqual(split("10.00", [1, 2, 3]), ["1.67", "3.33", "5.00"])
        # 100 cents by 3:3:1 -> remainders 6, 6, 2 of 7; floors 42, 42, 14 -> two cents left
        self.assertEqual(split("1", [3, 3, 1]), ["0.43", "0.43", "0.14"])
        # 100 cents by 1:1:5 -> 14.28, 14.28, 71.42: floors 14, 14, 71 (sum 99); remainders 2, 2, 3 -> last person
        self.assertEqual(split("1.00", [1, 1, 5]), ["0.14", "0.14", "0.72"])

    def test_ties_go_to_earlier_people(self):
        self.assertEqual(split("0.05", [1] * 7), ["0.01"] * 5 + ["0.00"] * 2)
        self.assertEqual(split("0.02", [2, 1, 1, 2]), ["0.01", "0.00", "0.00", "0.01"])

    def test_zero_weights_and_short_totals(self):
        self.assertEqual(split("19.9", [1, 0, 1]), ["9.95", "0.00", "9.95"])
        self.assertEqual(split("7", [1]), ["7.00"])
        self.assertEqual(split("0", [1, 2]), ["0.00", "0.00"])
        self.assertEqual(split("0.01", [0, 0, 5]), ["0.00", "0.00", "0.01"])

    def test_huge_amount_is_exact(self):
        self.assertEqual(split("90071992547409.93", [1, 1]), ["45035996273704.97", "45035996273704.96"])
        shares = split("123456789012345678.91", [3, 7, 11, 13])
        self.assertAddsUp("123456789012345678.91", shares)

    def test_always_adds_up(self):
        for total in ["0.01", "0.99", "1.00", "13.37", "250.5", "999999.99"]:
            for weights in [[1, 1, 1], [2, 3], [1, 0, 4, 9], [5] * 11, [1, 99]]:
                self.assertAddsUp(total, split(total, weights))

    def test_rejects_bad_input(self):
        for total, weights in [
            ("1.234", [1]),
            ("-5", [1]),
            ("abc", [1]),
            ("", [1]),
            ("1.2.3", [1]),
            ("10", []),
            ("10", [0, 0]),
            ("10", [1, -1]),
        ]:
            with self.assertRaises(ValueError, msg=(total, weights)):
                split(total, weights)


if __name__ == "__main__":
    unittest.main()
