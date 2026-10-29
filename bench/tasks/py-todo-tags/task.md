Add tags to the `todo` command-line app (the `todo/` package; run it with `python3 -m todo --file <path> <command>`). The storage, model and CLI code are in separate modules; keep that structure. The existing tests in `tests/` must keep passing (`python3 -m unittest discover tests`).

- `add TEXT [--tag TAG]...` attaches tags to the new task. `--tag` can be repeated.
- `tag ID TAG...` adds tags to an existing task and `untag ID TAG...` removes them (removing a tag the task doesn't have is fine). Both print the task's updated line, as `list` shows it.
- `list [--all] [--tag TAG]...`: with `--tag`, show only tasks that have every given tag. A task with tags shows them after its text, each as ` #tag`, in alphabetical order: `3. [ ] Buy milk #errands #home`. Tasks without tags look exactly as before.
- `tags` prints one line `<tag> <count>` per tag used by at least one open (not done) task, sorted by tag, where count is the number of open tasks with that tag.
- Tags are stored and shown in lower case (`--tag Home` is `home`), and a task never has the same tag twice. After lower-casing, a tag must match `[a-z0-9-]+`; otherwise print an error to stderr, exit with status 2 and change nothing. `tag`/`untag` with an unknown task id print an error to stderr and exit with status 1, like `done`.
- Tags are saved in the JSON file. Files written by the current version, which have no tags, must keep working.
