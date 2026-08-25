import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import superjson from "superjson";
import { collaborationAuth } from "../collaboration/auth";

export type LocalContext = CreateExpressContextOptions;

const t = initTRPC.context<LocalContext>().create({ transformer: superjson });

function isLoopback(address: string | undefined) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const localProcedure = t.procedure.use(
  t.middleware(({ ctx, next }) => {
    if (process.env.COF_BP_MODE === "shared") {
      const user = collaborationAuth.getSession(ctx.req);
      if (!user || user.role !== "admin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "共享部署仅允许管理员读取项目管理接口",
        });
      }
      return next();
    }
    if (!isLoopback(ctx.req.socket.remoteAddress)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cofound BP Desk 仅接受本机请求",
      });
    }
    return next();
  })
);

export const createLocalContext = (
  options: CreateExpressContextOptions
): LocalContext => options;
