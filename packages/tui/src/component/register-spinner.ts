import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerDevcodeSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
