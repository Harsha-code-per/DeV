class Inventory:
    def __init__(self):
        self.items = {}

    def add(self, name, qty=1):
        self.items[name] = qty

    def remove(self, name, qty=1):
        if self.items.get(name, 0) < qty:
            raise ValueError(f"not enough {name}")
        self.items[name] -= qty

    def count(self, name):
        return self.items.get(name, 0)

    def names(self):
        return sorted(self.items)
