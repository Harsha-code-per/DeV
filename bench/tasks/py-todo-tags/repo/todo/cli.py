import argparse
import sys

from todo import storage
from todo.models import Task


def main(argv=None):
    parser = argparse.ArgumentParser(prog="todo")
    parser.add_argument("--file", default="todo.json")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add")
    add.add_argument("text")
    listing = commands.add_parser("list")
    listing.add_argument("--all", action="store_true")
    done = commands.add_parser("done")
    done.add_argument("id", type=int)
    args = parser.parse_args(argv)

    next_id, tasks = storage.load(args.file)
    if args.command == "add":
        tasks.append(Task(next_id, args.text))
        storage.save(args.file, next_id + 1, tasks)
        print(f"added {next_id}")
    elif args.command == "list":
        for task in tasks:
            if args.all or not task.done:
                print(task.line())
    elif args.command == "done":
        task = next((t for t in tasks if t.id == args.id), None)
        if task is None:
            print(f"no task {args.id}", file=sys.stderr)
            sys.exit(1)
        task.done = True
        storage.save(args.file, next_id, tasks)
