import csv
import io
import os
import subprocess
import sys
import tempfile
import unittest


def run(customers, orders):
    return subprocess.run([sys.executable, "merge.py", customers, orders], capture_output=True, text=True, timeout=30)


class MergeTest(unittest.TestCase):
    def write(self, text):
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="")
        handle.write(text)
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        return handle.name

    def rows(self, result):
        self.assertEqual(result.returncode, 0, result.stderr)
        return list(csv.reader(io.StringIO(result.stdout)))

    def test_sample(self):
        result = run("customers.csv", "orders.csv")
        self.assertEqual(
            self.rows(result),
            [
                ["id", "name", "orders", "total"],
                ["c1", "Ada Lovelace", "1", "19.99"],
                ["c2", "Hopper, Grace", "2", "15.10"],
                ["c3", 'The "Best" Shop', "0", "0.00"],
            ],
        )
        self.assertIn("c9", result.stderr)

    def test_columns_by_name_newlines_and_exact_sums(self):
        customers = self.write('email,name,id\r\nx@y,"Multi\nLine, Name",42\r\nz@y,Plain,7\r\n')
        orders = self.write(
            "status,amount,order_id,customer_id\n"
            "paid,1234567890123456.78,a,42\n"
            "paid,0.01,b,42\n"
            "paid,0.1,c,7\n"
            "paid,0.2,d,7\n"
            "refunded,1000,e,7\n"
            "shipped,3,f,7\n"
        )
        self.assertEqual(
            self.rows(run(customers, orders)),
            [
                ["id", "name", "orders", "total"],
                ["42", "Multi\nLine, Name", "2", "1234567890123456.79"],
                ["7", "Plain", "3", "3.30"],
            ],
        )

    def test_unknown_customers_and_no_orders(self):
        customers = self.write("id,name,email\nc1,Solo,s@x\n")
        orders = self.write("order_id,customer_id,amount,status\no1,ghost,5,paid\no2,phantom,1,paid\n")
        result = run(customers, orders)
        self.assertEqual(self.rows(result), [["id", "name", "orders", "total"], ["c1", "Solo", "0", "0.00"]])
        self.assertIn("ghost", result.stderr)
        self.assertIn("phantom", result.stderr)

    def test_quotes_round_trip(self):
        customers = self.write('id,name,email\nq,"She said ""hi"", then left",q@x\n')
        orders = self.write("order_id,customer_id,amount,status\no1,q,7.5,paid\n")
        self.assertEqual(self.rows(run(customers, orders))[1], ["q", 'She said "hi", then left', "1", "7.50"])


if __name__ == "__main__":
    unittest.main()
