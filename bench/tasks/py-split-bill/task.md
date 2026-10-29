`split` in `split.py` divides a bill between people by weight, but the shares often don't add up to the bill: `split("100.00", [1, 1, 1])` gives `33.33` three times, and a cent goes missing.

Fix it so the shares always add up exactly to the total, using this rule (no floats anywhere):

1. Work in whole cents. Each person first gets `floor(total_cents * weight / sum_of_weights)` cents.
2. The cents left over go one each to the people with the largest remainder of that division, i.e. the largest `(total_cents * weight) % sum_of_weights`. When remainders are equal, the person who appears earlier in `weights` gets the cent first.
3. A person with weight 0 always gets `0.00`.

Inputs and outputs:

- `total` is a non-negative decimal string with at most 2 decimal places, such as `"100.00"`, `"7"` or `"19.9"`. Amounts can be far larger than a float can hold exactly.
- `weights` is a list of non-negative integers with at least one above 0.
- It returns a list of strings, one per weight, each with exactly 2 decimals (`"33.34"`, `"0.00"`).
- Raise `ValueError` for a negative or malformed total, more than 2 decimal places, an empty weight list, a negative weight, or weights that are all 0.
