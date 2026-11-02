import type { DevcodeClient } from "@dev-ai/sdk/v2"

/**
 * A side question answered from the conversation so far, without touching it: the session is copied,
 * the question is asked in the copy with every tool turned off, and the copy is deleted afterwards.
 * The task in the original session keeps running undisturbed.
 */
export async function askAside(client: DevcodeClient, sessionID: string, question: string) {
  const copy = await client.session.fork({ sessionID }, { throwOnError: true })
  try {
    const reply = await client.session.prompt(
      {
        sessionID: copy.data.id,
        tools: { "*": false },
        parts: [
          {
            type: "text",
            text: `Side question, asked while the task above may still be running. Answer it briefly from what this conversation already shows. Do not start or change any work.\n\n${question}`,
          },
        ],
      },
      { throwOnError: true },
    )
    return reply.data.parts.flatMap((part) => (part.type === "text" && !part.synthetic ? [part.text] : [])).join("\n").trim()
  } finally {
    await client.session.delete({ sessionID: copy.data.id }).catch(() => {})
  }
}
