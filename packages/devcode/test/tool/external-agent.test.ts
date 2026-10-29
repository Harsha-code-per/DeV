import { expect, test } from "bun:test"
import { ExternalAgent } from "../../src/tool/external-agent"

test("reads each CLI's final answer from its headless output", () => {
  expect(ExternalAgent.answer("claude", '{"type":"result","result":"done","total_cost_usd":0.01}\n')).toBe("done")
  expect(
    ExternalAgent.answer(
      "codex",
      ['{"type":"thread.started"}', '{"type":"item.completed","item":{"type":"agent_message","text":"fixed"}}', "noise"].join(
        "\n",
      ),
    ),
  ).toBe("fixed")
  expect(ExternalAgent.answer("gemini", '{"response":"hi","stats":{}}')).toBe("hi")
  expect(ExternalAgent.answer("claude", "not json")).toBeUndefined()
})
