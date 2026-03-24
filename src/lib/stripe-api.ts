/**
 * Stripe API integration (read-only).
 * Uses raw fetch with restricted API key. No external Stripe SDK.
 */

const STRIPE_API = "https://api.stripe.com/v1"

export interface StripeDailyRevenue {
  date: string         // YYYY-MM-DD
  revenue: number      // cents
  refunds: number      // cents
  charges: number      // successful charge count
  refundCount: number
  newCustomers: number
  currency: string
}

export interface StripeOverview {
  totalRevenue: number       // cents
  totalRefunds: number       // cents
  totalCharges: number
  totalCustomers: number
  currency: string
  mrr: number                // estimated monthly recurring revenue (cents)
  activeSubscriptions: number
}

async function stripeGet(path: string, apiKey: string, params?: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${STRIPE_API}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stripe API error: ${res.status} — ${body}`)
  }

  return res.json()
}

/**
 * Validate a Stripe API key by fetching the balance (only needs rak_balance_read permission).
 */
export async function validateStripeKey(apiKey: string): Promise<{ accountId: string; displayName: string }> {
  const data = await stripeGet("/balance", apiKey) as {
    available: Array<{ amount: number; currency: string }>
    livemode: boolean
  }
  const currency = data.available?.[0]?.currency?.toUpperCase() || "USD"
  return {
    accountId: data.livemode ? "live" : "test",
    displayName: `Stripe (${currency})`,
  }
}

/**
 * Fetch daily revenue data for a date range.
 * Uses the charges list endpoint with created date filters.
 */
export async function fetchStripeRevenue(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<StripeDailyRevenue[]> {
  const start = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000)
  const end = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000)

  // Fetch successful charges
  const dailyMap = new Map<string, {
    revenue: number; refunds: number; charges: number; refundCount: number; currency: string
  }>()

  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const params: Record<string, string> = {
      "created[gte]": start.toString(),
      "created[lte]": end.toString(),
      limit: "100",
      "expand[]": "data.refunds",
    }
    if (startingAfter) params.starting_after = startingAfter

    const data = await stripeGet("/charges", apiKey, params) as {
      data: Array<{
        id: string
        amount: number
        amount_refunded: number
        currency: string
        status: string
        created: number
        refunded: boolean
        refunds?: { data: Array<{ amount: number }> }
      }>
      has_more: boolean
    }

    for (const charge of data.data) {
      if (charge.status !== "succeeded") continue

      const date = new Date(charge.created * 1000).toISOString().slice(0, 10)
      const existing = dailyMap.get(date) || { revenue: 0, refunds: 0, charges: 0, refundCount: 0, currency: charge.currency }

      existing.revenue += charge.amount
      existing.charges += 1
      if (charge.amount_refunded > 0) {
        existing.refunds += charge.amount_refunded
        existing.refundCount += 1
      }

      dailyMap.set(date, existing)
    }

    hasMore = data.has_more
    if (data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  // Fetch new customers
  const customerMap = new Map<string, number>()
  hasMore = true
  startingAfter = undefined

  while (hasMore) {
    const params: Record<string, string> = {
      "created[gte]": start.toString(),
      "created[lte]": end.toString(),
      limit: "100",
    }
    if (startingAfter) params.starting_after = startingAfter

    const data = await stripeGet("/customers", apiKey, params) as {
      data: Array<{ id: string; created: number }>
      has_more: boolean
    }

    for (const customer of data.data) {
      const date = new Date(customer.created * 1000).toISOString().slice(0, 10)
      customerMap.set(date, (customerMap.get(date) || 0) + 1)
    }

    hasMore = data.has_more
    if (data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  // Merge into daily results
  const allDates = new Set([...dailyMap.keys(), ...customerMap.keys()])

  return Array.from(allDates)
    .sort()
    .map((date) => {
      const charge = dailyMap.get(date) || { revenue: 0, refunds: 0, charges: 0, refundCount: 0, currency: "usd" }
      return {
        date,
        revenue: charge.revenue,
        refunds: charge.refunds,
        charges: charge.charges,
        refundCount: charge.refundCount,
        newCustomers: customerMap.get(date) || 0,
        currency: charge.currency,
      }
    })
}

/**
 * Fetch a high-level overview of the Stripe account.
 */
export async function fetchStripeOverview(apiKey: string): Promise<StripeOverview> {
  // Get balance
  const balance = await stripeGet("/balance", apiKey) as {
    available: Array<{ amount: number; currency: string }>
  }
  const currency = balance.available[0]?.currency || "usd"

  // Get active subscriptions count
  const subs = await stripeGet("/subscriptions", apiKey, { status: "active", limit: "1" }) as {
    data: unknown[]
    total_count?: number
  }

  // Estimate MRR from recent invoices (last 30 days)
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
  const invoices = await stripeGet("/invoices", apiKey, {
    "created[gte]": thirtyDaysAgo.toString(),
    status: "paid",
    limit: "100",
  }) as {
    data: Array<{ amount_paid: number; subscription?: string | null }>
  }

  const subscriptionRevenue = invoices.data
    .filter((inv) => inv.subscription)
    .reduce((sum, inv) => sum + inv.amount_paid, 0)

  // Get total customers
  const customers = await stripeGet("/customers", apiKey, { limit: "1" }) as {
    total_count?: number
  }

  return {
    totalRevenue: balance.available.reduce((sum, b) => sum + b.amount, 0),
    totalRefunds: 0,
    totalCharges: 0,
    totalCustomers: customers.total_count ?? 0,
    currency,
    mrr: subscriptionRevenue,
    activeSubscriptions: subs.data?.length ?? 0,
  }
}
