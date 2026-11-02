import { expect, test } from "bun:test"
import { ModePick } from "../../src/session/mode-pick"

test("large work starts in plan mode", () => {
  for (const prompt of [
    "add a complete user accounts system to this shop: signup, login, sessions, password reset, and per-user carts stored in sqlite",
    "build a REST API for this shop with products, orders and payments, plus a database layer and tests",
    "migrate this project to TypeScript and split the code into modules for pricing, tax and discounts",
    "add a discount engine with coupons, tiered pricing and stackable rules, used by total()",
    "fix login, but plan it first",
  ])
    expect(ModePick.pick(prompt)).toBe("plan_enter")
})

test("keep-going requests start a goal", () => {
  for (const prompt of [
    "keep going until all the tests pass",
    "do not stop until bun test is green",
    "run the tests and fix things, keep working until everything passes",
    "fix the failing tests until they pass",
    "keep fixing the tests",
  ])
    expect(ModePick.pick(prompt)).toBe("goal_set")
})

test("questions and small jobs go straight to work", () => {
  for (const prompt of [
    "fix the typo in the greet function in src/cart.js",
    "rename greet to sayHello in src/cart.js",
    "what does total() do?",
    "hi",
    "add a dark mode toggle",
    "add a percent-off coupon function to src/cart.js with a test",
    "just add a simple helper for formatting the price",
    "can you add a new provider and explain why it matters?",
    "don't stop the server when the tests finish",
  ])
    expect(ModePick.pick(prompt)).toBeUndefined()
})

test("you can always say no plan", () => {
  expect(ModePick.pick("build a REST API for this shop with products, without planning")).toBeUndefined()
})

test("open-ended requests about the person must ask or say they have enough", () => {
  for (const text of [
    "find hackathons between November 2 and November 10 that I can attend",
    "suggest a name for my new app",
    "plan a weekend trip for me",
    "organise a birthday party for my friend",
    "find me a job",
    "recommend a laptop I should buy",
  ])
    expect(ModePick.open(text)).toBe(true)
  for (const text of [
    "what is the capital of France?",
    "create a file named hello.txt containing the text hello world",
    "fix my failing test",
    "add a dark mode toggle",
    "explain what a closure is in JavaScript",
    "find the bug in src/server.ts for me",
  ])
    expect(ModePick.open(text)).toBe(false)
})

test("lasting instructions and preferences are saved first", () => {
  for (const text of [
    "From now on in this project, always use pnpm instead of npm.",
    "Please remember that the API key lives in Vault",
    "I prefer tabs over spaces",
    "never commit directly to main",
  ])
    expect(ModePick.remembers(text)).toBe(true)
  for (const text of ["fix the failing test", "what does this function do?", "add a login page"])
    expect(ModePick.remembers(text)).toBe(false)
})
