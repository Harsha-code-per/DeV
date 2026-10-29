`merge.py` joins a customers export with an orders export for the finance team: `python3 merge.py customers.csv orders.csv`. Finance reports that it garbles customer names with commas or quotes, counts refunded orders, prints totals like `30.1`, and loses cents on large amounts. Fix it (Python 3 standard library only).

Input files are CSV as Excel and Python's `csv` module write them: fields may be quoted, and quoted fields can contain commas, doubled quotes (`""`) and line breaks. Both files have a header row, but the column order can differ between exports, so find columns by header name: customers have `id`, `name`, `email`; orders have `order_id`, `customer_id`, `amount`, `status`. Amounts are non-negative decimals with up to 2 decimal places (`5`, `10.1`, `19.99`), and can be large.

Output, to stdout, valid CSV with a header row `id,name,orders,total` and one row per customer, in the order of the customers file. `orders` counts that customer's orders whose status is not `refunded`; `total` is the exact sum of those orders' amounts with exactly 2 decimals (`0.00` for none). Names must come out exactly as they are in the input.

Orders whose `customer_id` is not in the customers file are left out; for each one print a line containing that customer id to stderr. The exit status is 0 in that case.
