Users type formulas such as `price * (1 + tax)` into the spreadsheet feature, and `evaluate(source, vars)` in `src/calc.ts` is supposed to compute them. Right now it only works left to right. Implement it properly, keeping the exported `evaluate` signature and the `CalcError` class.

Syntax:

- Numbers: digits with an optional fractional part, e.g. `12`, `3.5` (not `.5` or `5.`).
- Variables: a letter or `_` followed by letters, digits or `_`, looked up in `vars`.
- Binary operators `+ - * / %` (`%` is JavaScript's remainder) and `^` (power), unary `-` and `+`, and parentheses. Whitespace (spaces, tabs) is ignored between tokens.
- Precedence from lowest to highest: `+ -`, then `* / %`, then unary `- +`, then `^`. So `-2^2` is `-4`, `2^-1` is `0.5` (a unary operator may start the right side of `^`), and `2*-3` is `-6`. `+ - * / %` are left-associative (`10-4-3` is `3`); `^` is right-associative (`2^3^2` is `512`).

Errors: throw a `CalcError` whose `position` is the 0-based index in `source` where the problem is:

- a character that can't start a token (e.g. `$`, `.5`, `5.`): the position of that character (for `5.` that is the `.`);
- a token where it doesn't belong, such as an operator with no left side, two numbers in a row, or a `)` with no matching `(`: the start of that token;
- input that ends too early (empty input, `1 +`, a missing `)`): `source.length`;
- an unknown variable (only keys `vars` itself has count, not inherited ones like `toString`): the start of its name;
- division or remainder by zero: the position of the `/` or `%` operator.
