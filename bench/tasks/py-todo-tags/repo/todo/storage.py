import json
import os

from todo.models import Task


def load(path):
    if not os.path.exists(path):
        return 1, []
    with open(path) as handle:
        data = json.load(handle)
    return data["next_id"], [Task.from_dict(t) for t in data["tasks"]]


def save(path, next_id, tasks):
    with open(path, "w") as handle:
        json.dump({"next_id": next_id, "tasks": [t.to_dict() for t in tasks]}, handle, indent=2)
