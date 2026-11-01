import { Locale } from "./locale"
import type { Receipt } from "../routes/session/turn"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

// Ink on saffron, the band that opens every DeV screen.
const band = "\x1b[48;2;242;165;22m\x1b[38;2;18;19;23m"

export function sessionEpilogue(input: { title: string; sessionID?: string; receipt?: Receipt }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  const receipt = input.receipt
  const changed = receipt?.files
    ? [`  ${weak("Files")}${receipt.files} changed  +${receipt.added} −${receipt.removed}`]
    : []
  const checks = receipt?.checks ? [`  ${weak("Checks")}${receipt.checks}`] : []
  const spent = receipt?.duration
    ? [`  ${weak("Time")}${Locale.duration(receipt.duration)}`, `  ${weak("Cost")}$${receipt.cost.toFixed(2)}`]
    : []
  return [
    `${band}${bold} DeV ${reset}${band} session receipt ${" ".repeat(38)}${reset}`,
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    ...changed,
    ...checks,
    ...spent,
    `  ${weak("Continue")}${bold}dev -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
