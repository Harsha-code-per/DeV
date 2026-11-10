"""Stock levels for a small shop."""


class Stock:
    def __init__(self):
        self._levels = {}

    def add(self, item, count):
        if count <= 0:
            raise ValueError("count must be positive")
        self._levels[item] = self._levels.get(item, 0) + count

    def remove(self, item, count):
        """Take count of item out of stock. Never goes below zero: raises ValueError instead."""
        if count <= 0:
            raise ValueError("count must be positive")
        if count > self._levels.get(item, 0):
            raise ValueError("not enough stock")
        self._levels[item] = self._levels.get(item, 0) - count

    def level(self, item):
        return self._levels.get(item, 0)
