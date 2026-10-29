# Config file format

The service reads its settings from an INI-style file. `ini.parse(text)` turns the text of such a file into a dict.

## Lines

- Lines end with `\n` or `\r\n`. Whitespace at the start and end of every line is ignored.
- Blank lines are ignored. A line whose first non-whitespace character is `;` or `#` is a comment and is ignored.
- Every other line must be a section header or a key-value pair. Anything else is an error.

## Sections

- A header is `[name]`. The name is trimmed and must not be empty. Section names are case-sensitive.
- Key-value pairs belong to the most recent header. Pairs that come before any header belong to the section named `""` (the empty string).
- The result is a dict mapping each section name to a dict of its keys, with sections in the order they first appear. A section with no keys is still present. The `""` section is present only if it has at least one key.
- A header for a section that already appeared continues that section.

## Keys and values

- A pair is `key = value`, split at the first `=`. The key is trimmed and must not be empty. Keys are case-insensitive and are stored in lower case.
- A key that appears twice in the same section (in any letter case, even across repeated headers) is an error.
- An unquoted value is trimmed. It ends at an inline comment: a `;` or `#` that has whitespace right before it, or that is the first character of the value. Any other `;` or `#` is part of the value (`url = a#b` gives `a#b`). An empty value gives `""`.
- An unquoted value is converted: `true` / `false` in any case become `True` / `False`, a whole number matching `-?[0-9]+` becomes an `int`, and anything else stays a string.
- A value that starts with `"` is a quoted string. It ends at the next `"` that is not escaped. Inside it, `\"` is a quote, `\\` is a backslash, `\n` is a newline and `\t` is a tab; any other `\` sequence is an error. A quoted value is always a string (`"42"` stays `"42"`). After the closing quote only whitespace or an inline comment may follow (the comment's `;` or `#` may come straight after the quote); anything else is an error. A missing closing quote is an error.

## Errors

Every error raises `ini.ParseError`, a subclass of `ValueError`, with a `line` attribute holding the 1-based number of the offending line.
