export * from "./client.js"
export * from "./server.js"

import { createDevcodeClient } from "./client.js"
import { createDevcodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createDevcode(options?: ServerOptions) {
  const server = await createDevcodeServer({
    ...options,
  })

  const client = createDevcodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
