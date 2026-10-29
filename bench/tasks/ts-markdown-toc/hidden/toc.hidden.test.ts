import { expect, test } from "bun:test"
import { toc } from "./src/toc"

test("sample README", async () => {
  expect(toc(await Bun.file("README.md").text())).toBe(
    ["- [Install](#install)", "- [Usage](#usage)", "  - [The `run` command](#the-run-command)", "- [Usage](#usage-1)"].join("\n"),
  )
})

test("levels 2 to 4 with indentation, others skipped", () => {
  const md = "# Title\n## A\n### B\n#### C\n##### D\n###### E\n## F\n"
  expect(toc(md)).toBe("- [A](#a)\n  - [B](#b)\n    - [C](#c)\n- [F](#f)")
})

test("not headings", () => {
  expect(toc("#tag\n####### seven\n ## indented\n##\tTab ok\nplain ## text\n")).toBe("- [Tab ok](#tab-ok)")
  expect(toc("no headings here")).toBe("")
  expect(toc("")).toBe("")
})

test("closing hashes and trimming", () => {
  expect(toc("##   Spaced out   ##   \n## C# language\n## Ends with#\n")).toBe(
    "- [Spaced out](#spaced-out)\n- [C# language](#c-language)\n- [Ends with#](#ends-with)",
  )
})

test("code fences", () => {
  const md = [
    "```",
    "## inside",
    "```",
    "## After backticks",
    "~~~~",
    "## inside tilde",
    "~~~",
    "## still inside (short close)",
    "~~~~~  ",
    "## After tildes",
    "````js",
    "```",
    "## inside (short close)",
    "````",
    "## Last",
    "```",
    "## never closed",
  ].join("\n")
  expect(toc(md)).toBe("- [After backticks](#after-backticks)\n- [After tildes](#after-tildes)\n- [Last](#last)")
})

test("anchors: punctuation, unicode, spaces", () => {
  const md = "## Hello, World!\n## Ünïcödé café\n## snake_case and-dash\n## a  b\n## 1.2.3 Release (beta)\n## 日本語の見出し\n## éclair\n"
  expect(toc(md)).toBe(
    [
      "- [Hello, World!](#hello-world)",
      "- [Ünïcödé café](#ünïcödé-café)",
      "- [snake_case and-dash](#snake_case-and-dash)",
      "- [a  b](#a--b)",
      "- [1.2.3 Release (beta)](#123-release-beta)",
      "- [日本語の見出し](#日本語の見出し)",
      "- [éclair](#éclair)",
    ].join("\n"),
  )
})

test("links show their label", () => {
  expect(toc("## See [the docs](https://example.com/a_b) and [API](#api)\n")).toBe(
    "- [See the docs and API](#see-the-docs-and-api)",
  )
})

test("duplicate anchors count every level and avoid claimed anchors", () => {
  const md = "# Intro\n## Intro\n## Intro\n##### Setup\n## Setup\n## A\n## A-1\n## A\n## B\n## B\n## B-1\n"
  expect(toc(md)).toBe(
    [
      "- [Intro](#intro-1)",
      "- [Intro](#intro-2)",
      "- [Setup](#setup-1)",
      "- [A](#a)",
      "- [A-1](#a-1)",
      "- [A](#a-2)",
      "- [B](#b)",
      "- [B](#b-1)",
      "- [B-1](#b-1-1)",
    ].join("\n"),
  )
})

test("CRLF line endings", () => {
  expect(toc("## One\r\n```\r\n## no\r\n```\r\n### Two ##\r\n")).toBe("- [One](#one)\n  - [Two](#two)")
})
