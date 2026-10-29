Write a bash script `prune.sh` that deletes old backups, keeping the newest few of each kind.

Usage: `bash prune.sh [--dry-run] <directory> <keep>`

Backups are files directly in `<directory>` named `<name>-YYYY-MM-DD.tar.gz`. `<name>` can contain dashes, spaces and digits (`my-app-2026-10-01.tar.gz` has the name `my-app`). For each name, keep the `<keep>` backups with the newest dates in their file names (ignore file modification times) and delete the others. Files that don't match the pattern, and anything in subdirectories, are never touched.

Print one line per deleted file, `deleted <file name>`, sorted by file name in byte order (`LC_ALL=C`). With `--dry-run` (only valid as the first argument), print `would delete <file name>` instead and delete nothing.

If the arguments are missing, the directory doesn't exist, or `<keep>` is not a whole number of at least 1, print a usage message to stderr, exit with status 2, and delete nothing. `backups/` has sample files.
