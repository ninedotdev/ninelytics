import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { users, apiKeys } from "@/server/db/schema"
import { eq, and } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth"

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  bio: z.string().optional(),
})

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
})

const createApiKeySchema = z.object({
  name: z.string().min(1, "API key name is required"),
})

export const settingsRouter = router({
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Check if email is already taken by another user
      if (input.email !== ctx.session!.user.email) {
        const existingUser = await ctx.db.query.users.findFirst({
          where: eq(users.email, input.email),
        })

        if (existingUser && existingUser.id !== userId) {
          throw new Error("Email is already taken")
        }
      }

      const [updated] = await ctx.db
        .update(users)
        .set({
          name: input.name,
          email: input.email,
          bio: input.bio ?? null,
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          bio: users.bio,
          image: users.image,
          role: users.role,
        })

      return updated
    }),

  updatePassword: protectedProcedure
    .input(updatePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Get current user with password
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { password: true },
      })

      if (!user?.password) {
        throw new Error("User not found or no password set")
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        input.currentPassword,
        user.password
      )

      if (!isCurrentPasswordValid) {
        throw new Error("Current password is incorrect")
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(input.newPassword, 12)

      // Update password
      await ctx.db
        .update(users)
        .set({ password: hashedNewPassword })
        .where(eq(users.id, userId))

      return { message: "Password updated successfully" }
    }),

  getApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id

    const keys = await ctx.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        websiteId: apiKeys.websiteId,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      key: k.keyPrefix,
      scopes: k.scopes,
      websiteId: k.websiteId,
      createdAt: k.createdAt,
      lastUsed: k.lastUsedAt,
      expiresAt: k.expiresAt,
    }))
  }),

  createApiKey: protectedProcedure
    .input(createApiKeySchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { key, hashedKey, keyPrefix } = generateApiKey()

      const [inserted] = await ctx.db
        .insert(apiKeys)
        .values({
          userId,
          name: input.name,
          hashedKey,
          keyPrefix,
          scopes: "read",
        })
        .returning({
          id: apiKeys.id,
          name: apiKeys.name,
          createdAt: apiKeys.createdAt,
        })

      return {
        id: inserted.id,
        name: inserted.name,
        key, // Return the FULL key once — it is never stored in plain text
        scopes: "read",
        websiteId: null,
        createdAt: inserted.createdAt,
        lastUsed: null,
        expiresAt: null,
      }
    }),

  deleteApiKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      await ctx.db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, userId)))

      return { message: "API key deleted successfully" }
    }),
})

