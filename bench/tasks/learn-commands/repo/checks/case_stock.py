import unittest

from inventory.stock import Stock


class AddAndLevel(unittest.TestCase):
    def test_add(self):
        stock = Stock()
        stock.add("tea", 2)
        stock.add("tea", 3)
        self.assertEqual(stock.level("tea"), 5)

    def test_remove(self):
        stock = Stock()
        stock.add("tea", 5)
        stock.remove("tea", 2)
        self.assertEqual(stock.level("tea"), 3)
