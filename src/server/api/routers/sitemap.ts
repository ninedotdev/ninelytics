import { z } from "zod"
import { eq, and, desc, sql, max } from "drizzle-orm"
import { websites, sitemapUrls } from "@/server/db/schema"
import { protectedProcedure, router } from "../trpc"
import { ensureAccess } from "./helpers/ensure-access"
import { nanoid } from "nanoid"

export const sitemapRouter = router({
  // Get sitemap settings for a website
  getSettings: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const [website] = await ctx.db
        .select({
          sitemapUrl: websites.sitemapUrl,
          autoIndexEnabled: websites.autoIndexEnabled,
          indexNowEnabled: websites.indexNowEnabled,
          indexNowKey: websites.indexNowKey,
          lastSitemapCheck: websites.lastSitemapCheck,
        })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)

      // Counts
      const counts = await ctx.db.execute<{
        total: string
        pending: string
        google_submitted: string
        google_error: string
        indexed: string
        indexnow_submitted: string
      }>(sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE google_status = 'pending' AND google_submitted_at IS NULL) as pending,
          COUNT(*) FILTER (WHERE google_status = 'submitted') as google_submitted,
          COUNT(*) FILTER (WHERE google_status = 'error') as google_error,
          COUNT(*) FILTER (WHERE google_status = 'indexed') as indexed,
          COUNT(*) FILTER (WHERE index_now_submitted_at IS NOT NULL) as indexnow_submitted
        FROM sitemap_urls
        WHERE website_id = ${input.websiteId}
      `)

      const stats = (counts as unknown as Array<{ total: string; pending: string; google_submitted: string; google_error: string; indexed: string; indexnow_submitted: string }>)[0]

      // Last successful Google submission time (to show "next in X min" timer)
      const lastSubmitResult = await ctx.db
        .select({ lastSubmit: max(sitemapUrls.googleSubmittedAt) })
        .from(sitemapUrls)
        .where(and(
          eq(sitemapUrls.websiteId, input.websiteId),
          eq(sitemapUrls.googleStatus, "submitted")
        ))

      return {
        ...website,
        stats: {
          total: Number(stats?.total ?? 0),
          pending: Number(stats?.pending ?? 0),
          googleSubmitted: Number(stats?.google_submitted ?? 0),
          googleError: Number(stats?.google_error ?? 0),
          indexed: Number(stats?.indexed ?? 0),
          indexNowSubmitted: Number(stats?.indexnow_submitted ?? 0),
        },
        lastGoogleSubmitAt: lastSubmitResult[0]?.lastSubmit ?? null,
      }
    }),

  // Update sitemap settings
  updateSettings: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      sitemapUrl: z.string().url().optional().or(z.literal("")),
      autoIndexEnabled: z.boolean().optional(),
      indexNowEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      const updates: Record<string, unknown> = {}
      if (input.sitemapUrl !== undefined) updates.sitemapUrl = input.sitemapUrl || null
      if (input.autoIndexEnabled !== undefined) updates.autoIndexEnabled = input.autoIndexEnabled
      if (input.indexNowEnabled !== undefined) updates.indexNowEnabled = input.indexNowEnabled

      // Auto-generate IndexNow key on first enable
      if (input.autoIndexEnabled) {
        const [existing] = await ctx.db
          .select({ indexNowKey: websites.indexNowKey })
          .from(websites)
          .where(eq(websites.id, input.websiteId))
          .limit(1)
        if (!existing?.indexNowKey) {
          updates.indexNowKey = nanoid(32)
        }
      }

      await ctx.db.update(websites).set(updates).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  // Verify IndexNow key file exists on the domain
  verifyIndexNowKey: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const [website] = await ctx.db
        .select({ url: websites.url, indexNowKey: websites.indexNowKey })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)

      if (!website?.indexNowKey) throw new Error("No IndexNow key generated")

      const domain = website.url.startsWith("http") ? website.url : `https://${website.url}`
      const host = new URL(domain).hostname

      const res = await fetch(`https://${host}/${website.indexNowKey}.txt`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null)

      const text = await res?.text().catch(() => "")
      const verified = text?.trim() === website.indexNowKey

      return { verified, key: website.indexNowKey, host }
    }),

  // List sitemap URLs with pagination
  listUrls: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      limit: z.number().default(50),
      offset: z.number().default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const rows = await ctx.db
        .select()
        .from(sitemapUrls)
        .where(
          and(
            eq(sitemapUrls.websiteId, input.websiteId),
            input.status ? eq(sitemapUrls.googleStatus, input.status) : undefined
          )
        )
        .orderBy(desc(sitemapUrls.firstSeenAt))
        .limit(input.limit)
        .offset(input.offset)

      return rows
    }),

  // Trigger manual check (calls the workflow)
  triggerCheck: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      const { start } = await import("workflow/api")
      const { pollAndIndexSitemap } = await import("@/workflows/sitemap-indexing")
      await start(pollAndIndexSitemap, [input.websiteId])

      return { success: true }
    }),
})
