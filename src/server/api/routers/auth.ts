import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, publicProcedure } from "@/server/api/trpc"
import { users } from "@/server/db/schema"
import { eq, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { isMultiTenant } from "@/lib/multi-tenant"

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email"),
        password: z.string().min(6, "Password must be at least 6 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isMultiTenant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration is disabled in personal mode",
        })
      }

      // Check email uniqueness
      const [existing] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1)

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        })
      }

      // Check if this is the first user (becomes super admin)
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(users)

      const isFirstUser = Number(count) === 0

      const hashedPassword = await bcrypt.hash(input.password, 12)

      const [newUser] = await ctx.db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          password: hashedPassword,
          role: isFirstUser ? "ADMIN" : "OWNER",
          isSuperAdmin: isFirstUser,
        })
        .returning({ id: users.id })

      return {
        id: newUser.id,
        isSuperAdmin: isFirstUser,
      }
    }),
})
