import { expect, test } from "bun:test"
import { slugify } from "./src/slugify"

test.each([
  ["Hello World", "hello-world"],
  ["Rock & Roll  Forever!", "rock-roll-forever"],
  ["  Many   spaces  ", "many-spaces"],
  ["Café au lait", "cafe-au-lait"],
  ["already-slugged", "already-slugged"],
  ["--a--b--", "a-b"],
  ["Version 2.0 released", "version-2-0-released"],
  ["snake_case_name", "snake-case-name"],
  ["!!!", ""],
])("slugify(%p) is %p", (input, expected) => {
  expect(slugify(input)).toBe(expected)
})
