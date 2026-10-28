import path from "path"

process.env.DEV_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
process.env.DEV_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.DEV_DISABLE_MODELS_FETCH = "true"
