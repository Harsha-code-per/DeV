import { expect, test } from "bun:test"
import { formatReport } from "./src/format"
import { parseRows } from "./src/parse"
import { buildReport } from "./src/report"
import { summarize } from "./src/summarize"

// Outputs captured from the original single-function buildReport.
const cases: [string, string, string][] = [
  [
    "sample",
    "# exported 2026-10-01\nAda Lovelace,Engineering,120_000,2019-03-01\nGrace Hopper,engineering,135000,2015-07-15\nLinus,Ops,90000,2021-01-04\nMargaret Hamilton,Engineering,128500,2017-11-20\nKen,Ops,,2020-05-05\nBarbara Liskov,Research,140000,2012-09-10\n",
    "Department   Staff  Average  Since\nEngineering      3  127,833  2015-07-15\nOps              1   90,000  2021-01-04\nResearch         1  140,000  2012-09-10\nTotal            5\nSkipped 1 line(s).\n"
  ],
  [
    "empty",
    "",
    "No staff.\n"
  ],
  [
    "onlyComments",
    "# a\n\n   \n#b\n",
    "No staff.\n"
  ],
  [
    "onlyBad",
    "x,y\nname,dept,abc,2020-01-01\n",
    "No staff.\nSkipped 2 line(s).\n"
  ],
  [
    "crlfAndSpaces",
    "  Zed , Sales , 50000 , 2020-02-02 \r\nAmy,sales,50001,2019-12-31\r\nBo,Support,1,2018-01-01\r\n",
    "Department  Staff  Average  Since\nSales           2   50,001  2019-12-31\nSupport         1        1  2018-01-01\nTotal           3\n"
  ],
  [
    "ties",
    "a,Beta,10,2020-01-01\nb,alpha,11,2020-01-02\nc,Gamma,13,2020-01-03\nd,beta,12,2019-05-05\ne,Alpha,12,2021-01-01\n",
    "Department  Staff  Average  Since\nalpha           2       12  2020-01-02\nBeta            2       11  2019-05-05\nGamma           1       13  2020-01-03\nTotal           5\n"
  ],
  [
    "rounding",
    "a,X,1,2020-01-01\nb,X,2,2020-01-01\nc,Y,1,2020-01-01\nd,Y,2,2020-01-01\ne,Y,2,2020-01-01\nf,Z,5,2020-01-01\ng,Z,6,2020-01-01\n",
    "Department  Staff  Average  Since\nY               3        2  2020-01-01\nX               2        2  2020-01-01\nZ               2        6  2020-01-01\nTotal           7\n"
  ],
  [
    "badFields",
    "a,X,1,2020-1-1\nb,,5,2020-01-01\n,X,5,2020-01-01\nc,X,-5,2020-01-01\nd,X,5.5,2020-01-01\ne,X,5,2020-01-01,extra\nf,X,_5,2020-01-01\ng,X,1e3,2020-01-01\nh,X,0,2020-01-01\n",
    "Department  Staff  Average  Since\nX               1        0  2020-01-01\nTotal           1\nSkipped 8 line(s).\n"
  ],
  [
    "longName",
    "a,Research and Development Europe,1234567,2001-01-01\nb,QA,999,2002-02-02\n",
    "Department                       Staff  Average  Since\nQA                                   1      999  2002-02-02\nResearch and Development Europe      1  1,234,567  2001-01-01\nTotal                                2\n"
  ]
]

for (const [name, input, output] of cases) test(`buildReport unchanged: ${name}`, () => expect(buildReport(input)).toBe(output))

test("parseRows trims, converts salary, keeps department case and counts skipped", () => {
  expect(parseRows("# c\n  Ada , Eng ,120_000, 2019-03-01\r\nbad line\nBo,eng,5,2020-01-01\n\nCy,X,abc,2020-01-01\n")).toEqual({
    rows: [
      { name: "Ada", department: "Eng", salary: 120000, start: "2019-03-01" },
      { name: "Bo", department: "eng", salary: 5, start: "2020-01-01" },
    ],
    skipped: 2,
  })
  expect(parseRows("")).toEqual({ rows: [], skipped: 0 })
})

test("summarize groups case-insensitively, rounds and sorts", () => {
  expect(
    summarize([
      { name: "a", department: "beta", salary: 1, start: "2020-05-05" },
      { name: "b", department: "Alpha", salary: 10, start: "2020-01-01" },
      { name: "c", department: "BETA", salary: 2, start: "2019-01-01" },
      { name: "d", department: "alpha", salary: 11, start: "2021-01-01" },
      { name: "e", department: "Gamma", salary: 7, start: "2018-01-01" },
      { name: "f", department: "Gamma", salary: 8, start: "2018-01-01" },
      { name: "g", department: "Gamma", salary: 8, start: "2018-01-01" },
    ]),
  ).toEqual([
    { department: "Gamma", count: 3, average: 8, earliest: "2018-01-01" },
    { department: "Alpha", count: 2, average: 11, earliest: "2020-01-01" },
    { department: "beta", count: 2, average: 2, earliest: "2019-01-01" },
  ])
  expect(summarize([])).toEqual([])
})

test("formatReport renders summaries", () => {
  expect(formatReport([{ department: "Ops", count: 2, average: 1234, earliest: "2020-01-01" }], 0)).toBe(
    "Department  Staff  Average  Since\nOps             2    1,234  2020-01-01\nTotal           2\n",
  )
  expect(formatReport([], 3)).toBe("No staff.\nSkipped 3 line(s).\n")
  expect(formatReport([], 0)).toBe("No staff.\n")
})

test("report.ts only composes the new modules", async () => {
  const source = await Bun.file("./src/report.ts").text()
  for (const name of ["parseRows", "summarize", "formatReport"]) expect(source).toContain(name)
  for (const leftover of ["split(", "padEnd", "padStart", "toLowerCase", "Math.round", "new Map"]) expect(source).not.toContain(leftover)
})
