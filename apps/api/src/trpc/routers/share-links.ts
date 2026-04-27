import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { websiteShareLinks } from "@ninelytics/db/schema"
import { protectedProcedure, router } from "../trpc"
import { ensureAccess } from "./helpers/ensure-access"

/**
 * Create a URL-safe random token. Uses Web Crypto so it works in Bun
 * runtime without extra deps. 32 hex chars = 128 bits of entropy, plenty
 * to make brute-forcing a public dashboard URL infeasible.
 */
function generateToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0")
  }
  return hex
}

export const shareLinksRouter = router({
  list: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const canAccess = await ensureAccess(ctx.db, input.websiteId, userId, false)
      if (!canAccess) throw new Error("Website not found or insufficient permissions")

      const rows = await ctx.db
        .select({
          id: websiteShareLinks.id,
          token: websiteShareLinks.token,
          label: websiteShareLinks.label,
          createdAt: websiteShareLinks.createdAt,
          expiresAt: websiteShareLinks.expiresAt,
          lastViewedAt: websiteShareLinks.lastViewedAt,
          viewCount: websiteShareLinks.viewCount,
        })
        .from(websiteShareLinks)
        .where(eq(websiteShareLinks.websiteId, input.websiteId))
        .orderBy(desc(websiteShareLinks.createdAt))

      return rows
    }),

  create: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
        label: z.string().max(80).optional(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const canEdit = await ensureAccess(ctx.db, input.websiteId, userId, true)
      if (!canEdit) throw new Error("Website not found or insufficient permissions")

      const token = generateToken()
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null

      const [row] = await ctx.db
        .insert(websiteShareLinks)
        .values({
          websiteId: input.websiteId,
          token,
          label: input.label ?? null,
          createdBy: userId,
          expiresAt,
        })
        .returning({
          id: websiteShareLinks.id,
          token: websiteShareLinks.token,
          label: websiteShareLinks.label,
          createdAt: websiteShareLinks.createdAt,
          expiresAt: websiteShareLinks.expiresAt,
        })

      return row
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Verify the link belongs to a website the user can edit.
      const [link] = await ctx.db
        .select({ websiteId: websiteShareLinks.websiteId })
        .from(websiteShareLinks)
        .where(eq(websiteShareLinks.id, input.id))
        .limit(1)
      if (!link) throw new Error("Share link not found")

      const canEdit = await ensureAccess(ctx.db, link.websiteId, userId, true)
      if (!canEdit) throw new Error("Insufficient permissions")

      await ctx.db
        .delete(websiteShareLinks)
        .where(and(eq(websiteShareLinks.id, input.id), eq(websiteShareLinks.websiteId, link.websiteId)))
      return { success: true }
    }),
})
