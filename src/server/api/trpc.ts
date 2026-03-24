import { initTRPC, TRPCError } from "@trpc/server"
import { getServerSession } from "next-auth"
import superjson from "superjson"
import { authOptions } from "@/lib/auth"
import { db } from "@/server/db/client"

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getServerSession(authOptions)

  return {
    session,
    db,
    headers: opts.headers,
  }
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
})

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }

  return next({
    ctx: {
      session: ctx.session,
      db: ctx.db,
      headers: ctx.headers,
    },
  })
})

// Middleware to pass headers to public procedures
const passHeaders = t.middleware(({ ctx, next }) => {
  return next({
    ctx: {
      ...ctx,
      headers: ctx.headers,
    },
  })
})

const hasRole = (roles: Array<"ADMIN" | "OWNER" | "VIEWER">) =>
  t.middleware(({ ctx, next }) => {
    const role = ctx.session?.user?.role
    if (!role || !roles.includes(role)) {
      throw new TRPCError({ code: "FORBIDDEN" })
    }
    return next({
      ctx,
    })
  })

const checkSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.isSuperAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Super admin access required" })
  }
  return next({ ctx })
})

export const router = t.router
export const middleware = t.middleware
export const publicProcedure = t.procedure.use(passHeaders)
export const protectedProcedure = t.procedure.use(isAuthed)
export const superAdminProcedure = protectedProcedure.use(checkSuperAdmin)
export const roleProcedure = (roles: Array<"ADMIN" | "OWNER" | "VIEWER">) =>
  protectedProcedure.use(hasRole(roles))

export const createCallerFactory = t.createCallerFactory

