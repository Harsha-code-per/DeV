declare global {
  const DEV_VERSION: string
  const DEV_CHANNEL: string
}

export const InstallationVersion = typeof DEV_VERSION === "string" ? DEV_VERSION : "local"
export const InstallationChannel = typeof DEV_CHANNEL === "string" ? DEV_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
