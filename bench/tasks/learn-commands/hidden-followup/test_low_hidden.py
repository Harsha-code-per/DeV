import sys
import unittest

sys.path.insert(0, "lib")
from inventory.stock import Stock


class Low(unittest.TestCase):
    def test_low(self):
        stock = Stock()
        stock.add("tea", 2)
        stock.add("jam", 9)
        stock.add("ale", 1)
        self.assertEqual(stock.low(2), ["ale", "tea"])

    def test_none_low(self):
        stock = Stock()
        stock.add("tea", 5)
        self.assertEqual(stock.low(1), [])
