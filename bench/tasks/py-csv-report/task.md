Write a command-line script `report.py` (Python 3 standard library only) that summarises a sales CSV file.

Usage: `python3 report.py <file.csv>`

The CSV has a header row `date,region,amount`. For each region print one line `<region>: <total>` with the total formatted to exactly 2 decimals, sorted by total from highest to lowest (regions with equal totals in alphabetical order). Then print a final line `TOTAL: <grand total>` with 2 decimals. Region names may contain spaces and are case-sensitive.

If the file does not exist, print an error message to stderr and exit with status 1, printing nothing to stdout.

`sales.csv` is a sample input you can try it on.
