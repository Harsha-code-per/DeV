"""Usage: python3 merge.py customers.csv orders.csv

Prints one CSV row per customer with their number of orders and order total.
"""
import sys


def read(path):
    with open(path) as handle:
        lines = handle.read().splitlines()
    header = lines[0].split(",")
    return [dict(zip(header, line.split(","))) for line in lines[1:] if line]


customers = read(sys.argv[1])
orders = read(sys.argv[2])
print("id,name,orders,total")
for customer in customers:
    mine = [o for o in orders if o["customer_id"] == customer["id"]]
    total = sum(float(o["amount"]) for o in mine)
    print(f"{customer['id']},{customer['name']},{len(mine)},{round(total, 2)}")
