Write a bash script `top5xx.sh` that finds which clients get the most server errors from nginx access logs, including rotated and compressed ones.

Usage: `bash top5xx.sh [-n N] <directory>`

Read every file in `<directory>` (not in subdirectories) whose name is `access.log` or starts with `access.log.`; files ending in `.gz` are gzip-compressed. Other files are ignored. Each line looks like:

```
203.0.113.5 - - [29/Oct/2026:10:00:00 +0000] "GET /api HTTP/1.1" 502 120 "-" "curl/8.0"
```

The client IP is the first field. The status code is the field right after the quoted request; the request, referrer and user agent are in double quotes and can contain spaces and digits, so don't rely on fixed field numbers. Count the lines with a status from 500 to 599 per IP and print the top N IPs (default 10) as `<count> <ip>`, one per line, highest count first; equal counts are ordered by IP in byte order (as `LC_ALL=C sort` orders them). Print nothing when there are no such lines.

If the directory argument is missing or is not a directory, or `-n` is not a positive whole number, print a usage message to stderr and exit with status 2. `logs/` has sample files.
