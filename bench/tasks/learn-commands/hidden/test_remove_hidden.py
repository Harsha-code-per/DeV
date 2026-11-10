import sys
import unittest

sys.path.insert(0, "lib")
from inventory.stock import Stock


class Remove(unittest.TestCase):
    def test_cannot_go_below_zero(self):
        stock = Stock()
        stock.add("tea", 2)
        with self.assertRaises(ValueError):
            stock.remove("tea", 3)
        self.assertEqual(stock.level("tea"), 2)

    def test_can_empty(self):
        stock = Stock()
        stock.add("tea", 2)
        stock.remove("tea", 2)
        self.assertEqual(stock.level("tea"), 0)
