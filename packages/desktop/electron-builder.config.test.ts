import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const channels = [
  { channel: "dev", appId: "io.github.harsha-code-per.dev.dev" },
  { channel: "beta", appId: "io.github.harsha-code-per.dev.beta" },
  { channel: "prod", appId: "io.github.harsha-code-per.dev" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.DEV_CHANNEL
    process.env.DEV_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.DEV_CHANNEL
    else process.env.DEV_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
    expect(config.deb?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
    expect(config.rpm?.fpm).toContainEqual(expect.stringContaining(`/usr/share/metainfo/${channel.appId}.metainfo.xml`))
  })
}

test("publishes prod updates to DeV's GitHub releases only", async () => {
  const previous = process.env.DEV_CHANNEL
  process.env.DEV_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?publish=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.DEV_CHANNEL
  else process.env.DEV_CHANNEL = previous

  expect(config.publish).toEqual({ provider: "github", owner: "Harsha-code-per", repo: "DeV", channel: "latest" })
  expect(config.protocols).toEqual({ name: "DeV", schemes: ["devai"] })
})

test("bundles the CLI outside the dev app archive", async () => {
  const previous = process.env.DEV_CHANNEL
  process.env.DEV_CHANNEL = "dev"
  const module = await import("./electron-builder.config.ts?cli-resource")
  const config = module.default as Configuration
  if (previous === undefined) delete process.env.DEV_CHANNEL
  else process.env.DEV_CHANNEL = previous

  expect(config.files).toContain("!resources/devcode*")
  expect(config.extraResources).toContainEqual({
    from: "resources/",
    to: "",
    filter: ["devcode*"],
  })
})

for (const channel of ["beta", "prod"] as const) {
  test(`does not bundle the CLI in ${channel} builds`, async () => {
    const previous = process.env.DEV_CHANNEL
    process.env.DEV_CHANNEL = channel
    const module = await import(`./electron-builder.config.ts?no-cli-resource=${channel}`)
    const config = module.default as Configuration
    if (previous === undefined) delete process.env.DEV_CHANNEL
    else process.env.DEV_CHANNEL = previous

    expect(config.extraResources).not.toContainEqual({
      from: "resources/",
      to: "",
      filter: ["devcode*"],
    })
  })
}
