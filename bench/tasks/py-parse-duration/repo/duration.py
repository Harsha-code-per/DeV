def parse_duration(text):
    """Parse a human duration such as "1h30m" or "2d 4h" into whole seconds.

    - Units are d (days), h (hours), m (minutes) and s (seconds), each with a
      non-negative integer amount: "45s", "2d", "1h30m", "1d2h3m4s".
    - Units must appear in that order (d, h, m, s) and each at most once.
    - Whitespace is allowed around and between components: " 1h  15m ".
    - A bare non-negative integer means seconds: "90" is 90.
    - Anything else raises ValueError, including "", "   ", "1x", "h",
      "1.5h", "-5s", "1m1h", "1h1h" and "1 h".

    Returns an int.
    """
    raise NotImplementedError
