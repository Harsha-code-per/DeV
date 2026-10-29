`truncate` and `initials` in `src/text.ts` render user names and message previews, and they break on non-ASCII text: emoji get cut in half into broken characters, flags turn into letters, and accented letters lose their accents.

Fix both. A "character" here means a user-perceived character (an extended grapheme cluster, as `Intl.Segmenter` with `granularity: "grapheme"` splits text), so an emoji family, a flag or a letter with a combining accent each count as one.

`truncate(text, max)`:
- If `text` has at most `max` characters, return it unchanged.
- Otherwise return its first `max - 1` characters followed by `"…"`, so the result has exactly `max` characters, except that whitespace right before the `"…"` is removed (`truncate("hello world", 7)` is `"hello…"`).
- `max` below 1 throws a `RangeError`.

`initials(name)`:
- Words are separated by any whitespace (spaces, tabs, newlines, several in a row); leading and trailing whitespace is ignored.
- Return the first character of each of the first two words, upper-cased with `toUpperCase()`, joined together; `""` for a blank name.
