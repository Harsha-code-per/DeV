`toc(markdown)` in `src/toc.ts` builds the table of contents for our docs pages, and its links must point at the anchors the page renderer generates. It currently picks up `#` comments inside code blocks, makes broken anchors, and gives repeated headings the same anchor. Rewrite it to these rules:

Headings:
- A heading is a line that starts (at column 0) with 1 to 6 `#` characters followed by at least one space or tab, then the text. `#tag` and `####### x` are not headings. Lines end with `\n` or `\r\n`.
- A closing run of `#` characters at the end of the line (trailing whitespace aside) is removed if whitespace comes right before it, and the text is then trimmed (`## Usage ##` has the text `Usage`; `## C#` keeps its `#`).
- Lines inside fenced code blocks are never headings. A fence opens on a line starting with 3 or more backticks or 3 or more tildes and closes on a line consisting only of at least as many of the same character (trailing whitespace allowed). An unclosed fence runs to the end of the document.

Output:
- Only levels 2 to 4 are listed, in document order, as `- [<text>](#<anchor>)`. Level 2 has no indentation, and each level below adds two spaces. Lines are joined with `\n` with no trailing newline; a document with nothing to list gives `""`.
- In the shown text, Markdown links `[label](url)` are replaced by their label; everything else is kept as written.

Anchors (computed from the shown text):
- Lower-case it with `toLowerCase()`, remove every character that is not a Unicode letter, mark or number, a space, `-` or `_`, then replace each space with `-` (no collapsing: `a  b` becomes `a--b`).
- Every heading at every level 1 to 6 (outside code blocks) claims an anchor, even those not listed. If its anchor was already claimed by an earlier heading, it gets `<anchor>-<n>` with the smallest `n >= 1` that is not claimed yet.

`README.md` is a sample document.
