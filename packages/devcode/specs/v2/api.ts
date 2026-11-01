// @ts-nocheck

import { DevCode } from "@dev-ai/core"
import { ReadTool } from "@dev-ai/core/tools"

const devcode = DevCode.make({})

devcode.tool.add(ReadTool)

devcode.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

devcode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

devcode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await devcode.session.create({
  agent: "build",
})

devcode.subscribe((event) => {
  console.log(event)
})

await devcode.session.prompt({
  sessionID,
  text: "hey what is up",
})

await devcode.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await devcode.session.wait()

console.log(await devcode.session.messages(sessionID))
