import { SourceInstall } from "../source-install"

export const UninstallCommand = {
  command: "uninstall",
  describe: "show how to remove DeV Code and its data",
  handler: () => SourceInstall.uninstall(),
}
