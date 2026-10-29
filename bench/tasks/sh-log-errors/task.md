Write a bash script `errors.sh` that reports how many error lines each log file has.

Usage: `bash errors.sh <directory>`

For every file in `<directory>` whose name ends in `.log` (not in subdirectories), count the lines that contain the exact uppercase word `ERROR`. Print one line per file as `<name> <count>`, where `<name>` is the file name without the `.log` suffix. Skip files with zero errors. Sort by count, highest first; files with the same count in alphabetical order of name. Print nothing if no file has errors. If the argument is missing or is not a directory, print a usage message to stderr and exit with status 2.

`logs/` contains sample files to try it on.
