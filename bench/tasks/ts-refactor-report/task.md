`buildReport` in `src/report.ts` is one long function that parses the staff CSV, groups it by department and formats the text report. Split it into three modules so each part can be tested and reused:

- `src/parse.ts` exports `type Row = { name: string; department: string; salary: number; start: string }` and `parseRows(csv: string): { rows: Row[]; skipped: number }`. It does all the line handling and validation `buildReport` does today: rows come back in input order with trimmed fields, `salary` as a number (underscores removed), `department` exactly as written (no case change), and `skipped` counts the lines that are rejected.
- `src/summarize.ts` exports `type Summary = { department: string; count: number; average: number; earliest: string }` and `summarize(rows: Row[]): Summary[]`. It does the grouping (departments compared case-insensitively, shown with the first spelling seen), the rounded average, the earliest start date and the sorting.
- `src/format.ts` exports `formatReport(summaries: Summary[], skipped: number): string`, which produces the text exactly as `buildReport` does today from those values.
- `src/report.ts` keeps exporting `buildReport(csv)`, which now only composes `parseRows`, `summarize` and `formatReport` (no parsing, grouping or formatting code left in it), and re-exports the `Row` and `Summary` types.

This is a pure refactor: `buildReport` must return exactly the same string as now for every input, including its current quirks (rounding, sorting, column widths, the "Skipped" line, the "No staff." case). `staff.csv` is a sample input.
