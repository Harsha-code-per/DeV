import unittest

from inventory import Inventory


class InventoryHiddenTest(unittest.TestCase):
    def test_partial_remove_keeps_item(self):
        inv = Inventory()
        inv.add("kiwi", 5)
        inv.remove("kiwi", 2)
        self.assertEqual(inv.count("kiwi"), 3)
        self.assertEqual(inv.names(), ["kiwi"])

    def test_names_sorted_and_without_empty(self):
        inv = Inventory()
        inv.add("b")
        inv.add("a", 2)
        inv.add("c")
        inv.remove("b")
        self.assertEqual(inv.names(), ["a", "c"])

    def test_remove_missing_raises(self):
        with self.assertRaises(ValueError):
            Inventory().remove("ghost")


if __name__ == "__main__":
    unittest.main()
