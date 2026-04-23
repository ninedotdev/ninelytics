import { z } from "zod"
import { eq, and, desc, sql, isNull, count, gte } from "drizzle-orm"
import { websites, users, uptimeChecks, uptimeIncidents } from "@ninelytics/db/schema"
import { protectedProcedure, router } from "../trpc"
import { ensureAccess } from "./helpers/ensure-access"

export const uptimeRouter = router({
  getSettings: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const [website] = await ctx.db
        .select({
          uptimeEnabled: websites.uptimeEnabled,
          uptimeKeyword: websites.uptimeKeyword,
          uptimeInterval: websites.uptimeInterval,
          uptimeBaselineResponseTime: websites.uptimeBaselineResponseTime,
          uptimeContentHash: websites.uptimeContentHash,
          uptimeSslExpiry: websites.uptimeSslExpiry,
          lastUptimeCheck: websites.lastUptimeCheck,
          lastUptimeStatus: websites.lastUptimeStatus,
        })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)

      if (!website) return null

      // 30-day uptime percentage
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const [stats] = await ctx.db
        .select({
          total: count(),
          upCount: sql<number>`count(*) filter (where ${uptimeChecks.status} = 'up')`,
        })
        .from(uptimeChecks)
        .where(and(
          eq(uptimeChecks.websiteId, input.websiteId),
          gte(uptimeChecks.checkedAt, thirtyDaysAgo)
        ))

      const totalChecks = Number(stats?.total ?? 0)
      const upChecks = Number(stats?.upCount ?? 0)
      const uptimePercent = totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1000) / 10 : null

      // Open incidents count
      const [openIncidents] = await ctx.db
        .select({ count: count() })
        .from(uptimeIncidents)
        .where(and(
          eq(uptimeIncidents.websiteId, input.websiteId),
          isNull(uptimeIncidents.resolvedAt)
        ))

      return {
        ...website,
        uptimePercent,
        totalChecks,
        openIncidents: Number(openIncidents?.count ?? 0),
      }
    }),

  updateSettings: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      uptimeEnabled: z.boolean().optional(),
      uptimeKeyword: z.string().optional(),
      uptimeInterval: z.number().min(1).max(60).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      const updates: Record<string, unknown> = {}
      if (input.uptimeEnabled !== undefined) updates.uptimeEnabled = input.uptimeEnabled
      if (input.uptimeKeyword !== undefined) updates.uptimeKeyword = input.uptimeKeyword || null
      if (input.uptimeInterval !== undefined) updates.uptimeInterval = input.uptimeInterval

      await ctx.db.update(websites).set(updates).where(eq(websites.id, input.websiteId))

      // The worker runs a periodic scheduler that picks up enabled sites
      // automatically — no need to kick off anything here.

      return { success: true }
    }),

  triggerCheck: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const { enqueueWorkflowJob } = await import("@ninelytics/shared/workflow-queue")
      await enqueueWorkflowJob({ kind: "uptime-check", websiteId: input.websiteId })

      return { success: true }
    }),

  getStatus: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const [website] = await ctx.db
        .select({
          uptimeEnabled: websites.uptimeEnabled,
          lastUptimeCheck: websites.lastUptimeCheck,
          lastUptimeStatus: websites.lastUptimeStatus,
          uptimeBaselineResponseTime: websites.uptimeBaselineResponseTime,
        })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)

      if (!website?.uptimeEnabled) return null

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const [stats] = await ctx.db
        .select({
          total: count(),
          upCount: sql<number>`count(*) filter (where ${uptimeChecks.status} = 'up')`,
        })
        .from(uptimeChecks)
        .where(and(
          eq(uptimeChecks.websiteId, input.websiteId),
          gte(uptimeChecks.checkedAt, thirtyDaysAgo)
        ))

      const totalChecks = Number(stats?.total ?? 0)
      const upChecks = Number(stats?.upCount ?? 0)

      return {
        status: website.lastUptimeStatus ?? "unknown",
        lastCheck: website.lastUptimeCheck,
        responseTime: website.uptimeBaselineResponseTime,
        uptimePercent: totalChecks > 0 ? Math.round((upChecks / totalChecks) * 1000) / 10 : null,
      }
    }),

  getIncidents: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      return ctx.db
        .select()
        .from(uptimeIncidents)
        .where(eq(uptimeIncidents.websiteId, input.websiteId))
        .orderBy(desc(uptimeIncidents.startedAt))
        .limit(input.limit)
    }),

  getChecks: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      return ctx.db
        .select({
          status: uptimeChecks.status,
          statusCode: uptimeChecks.statusCode,
          responseTime: uptimeChecks.responseTime,
          checkedAt: uptimeChecks.checkedAt,
        })
        .from(uptimeChecks)
        .where(eq(uptimeChecks.websiteId, input.websiteId))
        .orderBy(desc(uptimeChecks.checkedAt))
        .limit(input.limit)
    }),

  resetContentBaseline: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      await ctx.db.update(websites).set({
        uptimeContentHash: null,
      }).where(eq(websites.id, input.websiteId))

      return { success: true }
    }),

  // ─── Notification preferences ─────────────────────────────────────────────

  getNotificationPrefs: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db
        .select({
          phoneNumber: users.phoneNumber,
          telegramChatId: users.telegramChatId,
          telegramBotToken: users.telegramBotToken,
          notifyOnDown: users.notifyOnDown,
          notifyOnRecovered: users.notifyOnRecovered,
          notifyOnDegraded: users.notifyOnDegraded,
          notifyOnSslExpiry: users.notifyOnSslExpiry,
          notifyOnContentChange: users.notifyOnContentChange,
          notifyViaApp: users.notifyViaApp,
          notifyViaEmail: users.notifyViaEmail,
          notifyViaSms: users.notifyViaSms,
          notifyViaTelegram: users.notifyViaTelegram,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      return user ?? null
    }),

  updateNotificationPrefs: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().optional(),
      notifyOnDown: z.boolean().optional(),
      notifyOnRecovered: z.boolean().optional(),
      notifyOnDegraded: z.boolean().optional(),
      notifyOnSslExpiry: z.boolean().optional(),
      notifyOnContentChange: z.boolean().optional(),
      notifyViaApp: z.boolean().optional(),
      notifyViaEmail: z.boolean().optional(),
      notifyViaSms: z.boolean().optional(),
      notifyViaTelegram: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ctx.db.update(users).set(input).where(eq(users.id, userId))
      return { success: true }
    }),

  pairTelegram: protectedProcedure
    .input(z.object({
      botToken: z.string().min(10),
      chatId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Validate bot token by calling getMe
      const meRes = await fetch(`https://api.telegram.org/bot${input.botToken}/getMe`)
      const meData = await meRes.json() as { ok: boolean; result?: { username: string } }
      if (!meData.ok) {
        throw new Error("Invalid bot token. Check your token from @BotFather.")
      }

      // Validate chat ID by sending a test message
      const testRes = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: "✅ *Ninelytics paired!* You'll receive uptime alerts here.",
          parse_mode: "Markdown",
        }),
      })
      const testData = await testRes.json() as { ok: boolean; description?: string }
      if (!testData.ok) {
        throw new Error(`Could not send to this Chat ID. Make sure you started a conversation with the bot first. ${testData.description ?? ""}`)
      }

      // Save to user
      await ctx.db.update(users).set({
        telegramBotToken: input.botToken,
        telegramChatId: input.chatId,
        notifyViaTelegram: true,
      }).where(eq(users.id, userId))

      return { success: true, botUsername: meData.result?.username }
    }),

  unpairTelegram: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      await ctx.db.update(users).set({
        telegramBotToken: null,
        telegramChatId: null,
        notifyViaTelegram: false,
      }).where(eq(users.id, userId))
      return { success: true }
    }),
})
