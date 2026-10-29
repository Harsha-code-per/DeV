def split(total, weights):
    """Split a bill of `total` (a decimal string such as "100.00") between people by weight.

    Returns one amount per weight, as strings with 2 decimals.
    """
    amount = float(total)
    whole = sum(weights)
    return ["%.2f" % (amount * weight / whole) for weight in weights]
