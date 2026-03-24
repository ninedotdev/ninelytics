import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { websites, stripeData } from "@/server/db/schema"
import { protectedProcedure, router } from "../../trpc"
import { ensureAccess } from "../helpers/ensure-access"

export const stripeRouter = router({
  connect: protectedProcedure
    .input(z.object({ websiteId: z.string(), apiKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      const { validateStripeKey } = await import("@/lib/stripe-api")
      const account = await validateStripeKey(input.apiKey)
      await ctx.db.update(websites).set({ stripeApiKey: input.apiKey, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true, accountId: account.accountId, displayName: account.displayName }
    }),

  disconnect: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({ stripeApiKey: null, stripeSyncedAt: null, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  sync: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      const [website] = await ctx.db.select({ stripeApiKey: websites.stripeApiKey }).from(websites).where(eq(websites.id, input.websiteId)).limit(1)
      if (!website?.stripeApiKey) throw new Error("No Stripe key connected")

      const { fetchStripeRevenue } = await import("@/lib/stripe-api")

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 89)

      const data = await fetchStripeRevenue(website.stripeApiKey, startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0])

      let synced = 0
      for (const day of data) {
        await ctx.db.insert(stripeData).values({
          websiteId: input.websiteId,
          recordDate: day.date,
          revenue: day.revenue,
          refunds: day.refunds,
          charges: day.charges,
          refundCount: day.refundCount,
          newCustomers: day.newCustomers,
          currency: day.currency,
        }).onConflictDoUpdate({
          target: [stripeData.websiteId, stripeData.recordDate],
          set: { revenue: sql`excluded.revenue`, refunds: sql`excluded.refunds`, charges: sql`excluded.charges`, refundCount: sql`excluded.refund_count`, newCustomers: sql`excluded.new_customers` },
        })
        synced++
      }

      await ctx.db.update(websites).set({ stripeSyncedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))

      try {
        const { checkIntegrationGoals } = await import("@/lib/integration-goals")
        await checkIntegrationGoals(ctx.db, input.websiteId)
      } catch { /* ignore */ }

      const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
      const totalCharges = data.reduce((s, d) => s + d.charges, 0)
      const totalNewCustomers = data.reduce((s, d) => s + d.newCustomers, 0)
      const currency = data[0]?.currency ?? "usd"
      const dateRange = data.length > 0 ? { from: data[0].date, to: data[data.length - 1].date } : null

      return { success: true, syncedDays: synced, totalRevenue, totalCharges, totalNewCustomers, currency, dateRange }
    }),

  revenue: protectedProcedure
    .input(z.object({ websiteId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - input.days)
      const startStr = startDate.toISOString().slice(0, 10)

      const rows = await ctx.db.execute<{ record_date: string; revenue: string; charges: string; new_customers: string; currency: string }>(sql`
        SELECT record_date, revenue, charges, new_customers, currency
        FROM stripe_data WHERE website_id = ${input.websiteId} AND record_date >= ${startStr}
        ORDER BY record_date ASC
      `)

      const data = (rows as unknown as Array<{ record_date: string; revenue: string; charges: string; new_customers: string; currency: string }>).map(r => ({
        date: r.record_date,
        revenue: Number(r.revenue) / 100,
        charges: Number(r.charges),
        newCustomers: Number(r.new_customers),
        currency: r.currency,
      }))

      return { data, totalRevenue: data.reduce((s, d) => s + d.revenue, 0), totalCharges: data.reduce((s, d) => s + d.charges, 0), currency: data[0]?.currency ?? "usd" }
    }),
})
