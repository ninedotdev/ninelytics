import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CountryFlag } from "@/components/ui/country-flag"
import { Skeleton } from "@/components/ui/skeleton"
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart"
import { Grid as VisxGrid } from "@/components/charts/grid"
import { XAxis as VisxXAxis } from "@/components/charts/x-axis"
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip"

export const Route = createFileRoute("/p/$token")({
  component: PublicSharePage,
})

interface ShareDashboard {
  website: { name: string; url: string; createdAt: string }
  label: string | null
  period: "1d" | "7d" | "30d" | "90d"
  timezone: string
  totals: { pageViews: number; visitors: number; sessions: number }
  topPages: Array<{ page: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  devices: Array<{ device: string; count: number }>
  browsers: Array<{ browser: string; count: number }>
  chart: Array<{ day: string; views: number; visitors: number }>
}

const PERIOD_OPTIONS = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const

function faviconFor(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null
  try {
    const u = new URL(siteUrl)
    return `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`
  } catch {
    return null
  }
}

function PublicSharePage() {
  const { token } = Route.useParams()
  const [period, setPeriod] = useState<ShareDashboard["period"]>("30d")
  const [data, setData] = useState<ShareDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const tz = useMemo(
    () =>
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC",
    [],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/public/share/${encodeURIComponent(token)}?period=${period}&tz=${encodeURIComponent(tz)}`)
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? `HTTP ${r.status}`)
          setData(null)
          return
        }
        const body = (await r.json()) as ShareDashboard
        setData(body)
      })
      .catch((e) => {
        if (cancelled) return
        setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, period, tz])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-base">Link unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const favicon = faviconFor(data?.website.url)
  const hostname = (() => {
    if (!data?.website.url) return null
    try { return new URL(data.website.url).hostname } catch { return null }
  })()

  const chartData = (data?.chart ?? []).map((c) => ({
    day: c.day,
    views: c.views,
    visitors: c.visitors,
  }))

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 md:px-6 md:py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={favicon}
                alt=""
                width={32}
                height={32}
                className="rounded-md border bg-muted shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="h-8 w-8 rounded-md bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-semibold truncate">
                {data?.website.name ?? <Skeleton className="h-5 w-40" />}
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {data ? (
                  <>
                    {hostname ? <span className="font-mono">{hostname}</span> : null}
                    {data.label ? <> · {data.label}</> : null}
                  </>
                ) : (
                  <Skeleton className="h-3 w-56" />
                )}
              </p>
            </div>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as ShareDashboard["period"])}>
            <SelectTrigger className="md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6 flex-1">
        {/* Totals */}
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Visitors", value: data?.totals.visitors },
            { label: "Page views", value: data?.totals.pageViews },
            { label: "Sessions", value: data?.totals.sessions },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-6">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </div>
                <div className="text-2xl font-semibold mt-1 tabular-nums">
                  {loading || m.value == null ? <Skeleton className="h-7 w-20" /> : m.value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily chart — same Visx area stack used in /websites/:id */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Traffic</CardTitle>
            <CardDescription>Page views and unique visitors per day</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : chartData.length === 0 ? (
              <div className="text-xs text-muted-foreground py-12 text-center">
                No data in this range
              </div>
            ) : (
              <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                <VisxGrid horizontal numTicksRows={4} />
                <VisxArea dataKey="views" fill="var(--chart-1)" fillOpacity={0.4} strokeWidth={2} />
                <VisxArea dataKey="visitors" fill="var(--chart-2)" fillOpacity={0.4} strokeWidth={2} />
                <VisxXAxis />
                <VisxChartTooltip
                  rows={(point) => [
                    { color: "var(--chart-1)", label: "Views", value: (point.views as number).toLocaleString() },
                    { color: "var(--chart-2)", label: "Visitors", value: (point.visitors as number).toLocaleString() },
                  ]}
                />
              </VisxAreaChart>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownCard title="Top pages" loading={loading}
            items={data?.topPages.map((p) => ({ key: p.page, value: p.count })) ?? []}
            emptyText="No pageviews in this range" />
          <BreakdownCard title="Top countries" loading={loading}
            items={(data?.topCountries ?? []).map((c) => ({
              key: c.country,
              value: c.count,
              prefix: <CountryFlag countryCode={c.country} size={14} />,
            }))}
            emptyText="No country data yet" />
          <BreakdownCard title="Devices" loading={loading}
            items={(data?.devices ?? []).map((d) => ({ key: d.device, value: d.count }))}
            emptyText="No device data yet" />
          <BreakdownCard title="Browsers" loading={loading}
            items={(data?.browsers ?? []).map((b) => ({ key: b.browser, value: b.count }))}
            emptyText="No browser data yet" />
        </div>
      </main>

      <footer className="border-t mt-4">
        <div className="container mx-auto px-4 py-4 md:px-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Powered by</span>
          <a
            href="/"
            className="font-semibold text-foreground hover:underline underline-offset-4"
          >
            Ninelytics
          </a>
        </div>
      </footer>
    </div>
  )
}

function BreakdownCard({
  title,
  items,
  emptyText,
  loading,
}: {
  title: string
  items: Array<{ key: string; value: number; prefix?: React.ReactNode }>
  emptyText: string
  loading: boolean
}) {
  const max = items.reduce((m, x) => Math.max(m, x.value), 0) || 1
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{emptyText}</p>
        ) : (
          items.slice(0, 8).map((it) => (
            <div key={it.key} className="relative">
              <div
                className="absolute inset-y-0 left-0 bg-primary/15 rounded-sm"
                style={{ width: `${Math.round((it.value / max) * 100)}%` }}
              />
              <div className="relative flex items-center justify-between gap-2 px-1.5 py-1 text-xs">
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  {it.prefix}
                  <span className="truncate">{it.key}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{it.value.toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
