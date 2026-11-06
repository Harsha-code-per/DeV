import { PermissionV1 } from "@dev-ai/core/v1/permission"
import { Permission } from "@/permission"
import { Config } from "@/config/config"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { PermissionNotFoundError } from "../errors"

export const permissionHandlers = HttpApiBuilder.group(InstanceHttpApi, "permission", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Permission.Service
    const config = yield* Config.Service

    const list = Effect.fn("PermissionHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const reply = Effect.fn("PermissionHttpApi.reply")(function* (ctx: {
      params: { requestID: PermissionV1.ID }
      payload: PermissionV1.ReplyBody
    }) {
      yield* svc
        .reply({
          requestID: ctx.params.requestID,
          reply: ctx.payload.reply,
          message: ctx.payload.message,
        })
        .pipe(
          Effect.catchTag("Permission.NotFoundError", (error) =>
            Effect.fail(
              new PermissionNotFoundError({
                requestID: String(error.requestID),
                message: `Permission request not found: ${error.requestID}`,
              }),
            ),
          ),
        )
      return true
    })

    const rule = Effect.fn("PermissionHttpApi.rule")(function* (ctx: { payload: PermissionV1.Rule }) {
      yield* svc.addRule(ctx.payload)
      // Saved without the global config restart, which would abort the work in progress. Other projects pick the
      // rule up the next time they load. A tool set to one action ("bash": "ask") keeps it as the "*" fallback.
      const current = (yield* config.getGlobal()).permission?.[ctx.payload.permission]
      yield* config.updateGlobal({
        permission: {
          [ctx.payload.permission]: {
            ...(typeof current === "string" ? { "*": current } : {}),
            [ctx.payload.pattern]: ctx.payload.action,
          },
        },
      })
      return true
    })

    return handlers.handle("list", list).handle("reply", reply).handle("rule", rule)
  }),
)
