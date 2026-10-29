// Builds the staff report printed at the end of each month from a CSV export.
// Input lines: name,department,salary,start (start is YYYY-MM-DD).
export function buildReport(csv: string): string {
  const groups = new Map<string, { department: string; count: number; sum: number; earliest: string }>()
  let skipped = 0
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    const fields = line.split(",").map((f) => f.trim())
    if (fields.length !== 4 || fields[0] === "" || fields[1] === "") {
      skipped++
      continue
    }
    const salary = Number(fields[2].replace(/_/g, ""))
    if (!/^\d[\d_]*$/.test(fields[2]) || !Number.isFinite(salary)) {
      skipped++
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields[3])) {
      skipped++
      continue
    }
    const key = fields[1].toLowerCase()
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { department: fields[1], count: 1, sum: salary, earliest: fields[3] })
      continue
    }
    group.count++
    group.sum += salary
    if (fields[3] < group.earliest) group.earliest = fields[3]
  }

  const rows = [...groups.values()]
    .map((g) => ({ department: g.department, count: g.count, average: Math.round(g.sum / g.count), earliest: g.earliest }))
    .sort((a, b) => b.count - a.count || (a.department.toLowerCase() < b.department.toLowerCase() ? -1 : 1))

  if (rows.length === 0) return skipped > 0 ? `No staff.\nSkipped ${skipped} line(s).\n` : "No staff.\n"
  const width = Math.max(10, ...rows.map((r) => r.department.length))
  const lines = [
    `${"Department".padEnd(width)}  Staff  Average  Since`,
    ...rows.map(
      (r) =>
        `${r.department.padEnd(width)}  ${String(r.count).padStart(5)}  ${r.average.toLocaleString("en-US").padStart(7)}  ${r.earliest}`,
    ),
    `${"Total".padEnd(width)}  ${String(rows.reduce((n, r) => n + r.count, 0)).padStart(5)}`,
  ]
  if (skipped > 0) lines.push(`Skipped ${skipped} line(s).`)
  return lines.join("\n") + "\n"
}
