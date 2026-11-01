interface ImportMetaEnv {
  readonly DEV_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:devcode-server" {
  export namespace Server {
    export const listen: typeof import("../../../devcode/dist/types/src/node").Server.listen
    export type Listener = import("../../../devcode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../devcode/dist/types/src/node").Config.get
    export type Info = import("../../../devcode/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../devcode/dist/types/src/node").bootstrap
}
