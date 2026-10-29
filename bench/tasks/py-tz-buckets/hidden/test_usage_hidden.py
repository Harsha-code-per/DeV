import unittest

from usage import daily_totals


class DailyTotalsTest(unittest.TestCase):
    def test_summer_and_winter_offsets(self):
        events = [
            ("2026-01-15T23:30:00Z", 1),  # 00:30 next day in Berlin (UTC+1)
            ("2026-07-15T22:30:00Z", 2),  # 00:30 next day in Berlin (UTC+2)
            ("2026-07-15T21:30:00Z", 4),  # 23:30 same day in Berlin
        ]
        result = daily_totals(events, "Europe/Berlin")
        self.assertEqual(result["2026-01-16"], 1)
        self.assertEqual(result["2026-07-16"], 2)
        self.assertEqual(result["2026-07-15"], 4)
        self.assertEqual(result["2026-01-17"], 0)
        self.assertEqual(len(result), 182)

    def test_dst_transition_in_new_york(self):
        events = [
            ("2026-03-08T04:30:00Z", 1),  # 23:30 Mar 7 EST (UTC-5)
            ("2026-03-09T03:30:00Z", 10),  # 23:30 Mar 8 EDT (UTC-4)
            ("2026-03-09T04:30:00Z", 100),  # 00:30 Mar 9 EDT
        ]
        self.assertEqual(
            daily_totals(events, "America/New_York"),
            {"2026-03-07": 1, "2026-03-08": 10, "2026-03-09": 100},
        )

    def test_other_offsets_in_input(self):
        events = [
            ("2026-11-01T01:00:00+05:30", 3),  # 2026-10-31T19:30Z -> 19:30 Oct 31 in London (GMT since Oct 25)
            ("2026-10-31T23:59:00-01:00", 5),  # 2026-11-01T00:59Z -> Nov 1 in London
        ]
        self.assertEqual(daily_totals(events, "Europe/London"), {"2026-10-31": 3, "2026-11-01": 5})

    def test_includes_last_day_and_gaps(self):
        events = [("2026-05-01T12:00:00Z", 2), ("2026-05-04T12:00:00Z", 3), ("2026-05-01T13:00:00Z", 1)]
        result = daily_totals(events, "UTC")
        self.assertEqual(result, {"2026-05-01": 3, "2026-05-02": 0, "2026-05-03": 0, "2026-05-04": 3})
        self.assertEqual(list(result), sorted(result))

    def test_single_day(self):
        self.assertEqual(daily_totals([("2026-02-02T10:00:00Z", 7)], "Asia/Tokyo"), {"2026-02-02": 7})

    def test_month_and_year_boundaries(self):
        events = [("2026-12-31T15:30:00Z", 1), ("2027-01-01T00:00:00Z", 2)]
        self.assertEqual(daily_totals(events, "Asia/Kolkata"), {"2026-12-31": 1, "2027-01-01": 2})

    def test_empty(self):
        self.assertEqual(daily_totals([], "Europe/Berlin"), {})


if __name__ == "__main__":
    unittest.main()
