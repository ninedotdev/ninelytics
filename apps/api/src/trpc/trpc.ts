import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { db } from '@ninelytics/shared/db'

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: 'ADMIN' | 'OWNER' | 'VIEWER'
  isSuperAdmin: boolean
}

export type Session = {
  user: SessionUser
  expires?: string
}

export type TRPCContext = {
  session: Session | null
  db: typeof db
  headers: Headers
}

export const createTRPCContext = async (opts: {
  headers: Headers
  getSession: () => Promise<Session | null>
}): Promise<TRPCContext> => {
  const session = await opts.getSession()
  return { session, db, headers: opts.headers }
}

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson })

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      session: ctx.session as Session,
      db: ctx.db,
      headers: ctx.headers,
    },
  })
})

const hasRole = (roles: Array<'ADMIN' | 'OWNER' | 'VIEWER'>) =>
  t.middleware(({ ctx, next }) => {
    const role = ctx.session?.user?.role
    if (!role || !roles.includes(role)) {
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    return next({ ctx })
  })

const checkSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.isSuperAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Super admin access required' })
  }
  return next({ ctx })
})

export const router = t.router
export const middleware = t.middleware
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(isAuthed)
export const superAdminProcedure = protectedProcedure.use(checkSuperAdmin)
export const roleProcedure = (roles: Array<'ADMIN' | 'OWNER' | 'VIEWER'>) =>
  protectedProcedure.use(hasRole(roles))

export const createCallerFactory = t.createCallerFactory
