from dataclasses import dataclass


@dataclass
class Task:
    id: int
    text: str
    done: bool = False

    def to_dict(self):
        return {"id": self.id, "text": self.text, "done": self.done}

    @classmethod
    def from_dict(cls, data):
        return cls(id=data["id"], text=data["text"], done=data["done"])

    def line(self):
        return f"{self.id}. [{'x' if self.done else ' '}] {self.text}"
