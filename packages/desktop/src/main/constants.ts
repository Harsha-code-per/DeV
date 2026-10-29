import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.DEV_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// Only prod publishes an update feed (GitHub Releases); dev and beta builds are installed by hand.
export const UPDATER_ENABLED = app.isPackaged && CHANNEL === "prod"
