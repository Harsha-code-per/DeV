import unittest

from inventory import Inventory


class InventoryTest(unittest.TestCase):
    def test_add_accumulates(self):
        inv = Inventory()
        inv.add("apple", 2)
        inv.add("apple", 3)
        self.assertEqual(inv.count("apple"), 5)

    def test_remove_to_zero_forgets_item(self):
        inv = Inventory()
        inv.add("pear", 2)
        inv.remove("pear", 2)
        self.assertEqual(inv.names(), [])
        self.assertEqual(inv.count("pear"), 0)

    def test_remove_too_many_raises(self):
        inv = Inventory()
        inv.add("fig")
        with self.assertRaises(ValueError):
            inv.remove("fig", 2)
        self.assertEqual(inv.count("fig"), 1)


if __name__ == "__main__":
    unittest.main()
