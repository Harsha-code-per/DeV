import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId = channel === "prod" ? "io.github.harsha-code-per.dev" : `io.github.harsha-code-per.dev.${channel}`
const productName = channel === "prod" ? "DeV" : `DeV ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `Open source AI assistant for chat and coding${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="io.github.harsha-code-per">
    <name>Harshavardhan K</name>
  </developer>

  <description>
    <p>
      DeV is a free, open source AI assistant for chat and coding that works with any AI model.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/Harsha-code-per/DeV/issues</url>
  <url type="homepage">https://github.com/Harsha-code-per/DeV</url>
  <url type="vcs-browser">https://github.com/Harsha-code-per/DeV</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
