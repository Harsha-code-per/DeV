from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def daily_totals(events, tz):
    """Sum event amounts per local calendar day.

    events: list of (timestamp, amount) where timestamp is an ISO 8601 string with an offset.
    tz: IANA time zone name, e.g. "Europe/Berlin".
    Returns {"YYYY-MM-DD": total} with every day from the first to the last event day, sorted.
    """
    zone = ZoneInfo(tz)
    offset = datetime.now(zone).utcoffset()
    totals = {}
    for stamp, amount in events:
        when = datetime.fromisoformat(stamp).replace(tzinfo=None) + offset
        day = when.date().isoformat()
        totals[day] = totals.get(day, 0) + amount
    return fill_days(totals)


def fill_days(totals):
    if not totals:
        return {}
    start = date.fromisoformat(min(totals))
    end = date.fromisoformat(max(totals))
    days = [(start + timedelta(days=n)).isoformat() for n in range((end - start).days)]
    return {day: totals.get(day, 0) for day in days}
