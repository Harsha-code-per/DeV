import { SourceInstall } from "../source-install"

// Until DeV Code has its own release channel (roadmap M0.4), upgrading means rebuilding from git.
export const UpgradeCommand = {
  command: "upgrade",
  describe: "show how to update DeV Code",
  handler: () => SourceInstall.upgrade(),
}
