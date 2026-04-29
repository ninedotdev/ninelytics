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
import { BrowserIcon } from "@/components/ui/browser-icon"
import { DeviceIcon } from "@/components/ui/device-icon"
import { OsIcon } from "@/components/ui/os-icon"
import { Skeleton } from "@/components/ui/skeleton"
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart"
import { Grid as VisxGrid } from "@/components/charts/grid"
import { XAxis as VisxXAxis } from "@/components/charts/x-axis"
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip"
import { RingChart } from "@/components/charts/ring-chart"
import { Ring } from "@/components/charts/ring"
import { RingCenter } from "@/components/charts/ring-center"
import { IconEye, IconUsers, IconTrendingUp, IconClock } from "@tabler/icons-react"

export const Route = createFileRoute("/p/$token")({
  component: PublicSharePage,
})

interface ShareDashboard {
  website: { name: string; url: string; createdAt: string }
  label: string | null
  period: "1d" | "7d" | "30d" | "90d"
  timezone: string
  totals: {
    pageViews: number
    visitors: number
    sessions: number
    bounceRate: number
    avgSessionDuration: number
  }
  topPages: Array<{ page: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  devices: Array<{ device: string; count: number }>
  browsers: Array<{ browser: string; count: number }>
  os: Array<{ os: string; count: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  trafficSources: Array<{ source: string; count: number }>
  chart: Array<{ date: string; views: number; visitors: number }>
}

const PERIOD_OPTIONS = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins < 1) return `${secs}s`
  return `${mins}:${String(secs).padStart(2, "0")}`
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

  const chartData = data?.chart ?? []

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
        {/* KPI row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Page Views" icon={<IconEye size={16} />}
            value={loading || !data ? null : data.totals.pageViews.toLocaleString()} />
          <KpiCard label="Unique Visitors" icon={<IconUsers size={16} />}
            value={loading || !data ? null : data.totals.visitors.toLocaleString()} />
          <KpiCard label="Bounce Rate" icon={<IconTrendingUp size={16} />}
            value={loading || !data ? null : `${data.totals.bounceRate.toFixed(1)}%`} />
          <KpiCard label="Avg. Session" icon={<IconClock size={16} />}
            value={loading || !data ? null : formatDuration(data.totals.avgSessionDuration)} />
        </div>

        {/* Two area charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Page Views Over Time</CardTitle>
              <CardDescription>Daily page views for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" />
                : chartData.length === 0
                  ? <EmptyChart />
                  : (
                    <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                      <VisxGrid horizontal numTicksRows={4} />
                      <VisxArea dataKey="views" fill="var(--chart-1)" fillOpacity={0.4} strokeWidth={2} />
                      <VisxXAxis />
                      <VisxChartTooltip
                        rows={(point) => [
                          { color: "var(--chart-1)", label: "Views", value: (point.views as number).toLocaleString() },
                        ]}
                      />
                    </VisxAreaChart>
                  )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              <CardDescription>Daily unique visitors trend</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 w-full" />
                : chartData.length === 0
                  ? <EmptyChart />
                  : (
                    <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                      <VisxGrid horizontal numTicksRows={4} />
                      <VisxArea dataKey="visitors" fill="var(--chart-2)" fillOpacity={0.4} strokeWidth={2} />
                      <VisxXAxis />
                      <VisxChartTooltip
                        rows={(point) => [
                          { color: "var(--chart-2)", label: "Visitors", value: (point.visitors as number).toLocaleString() },
                        ]}
                      />
                    </VisxAreaChart>
                  )}
            </CardContent>
          </Card>
        </div>

        {/* Browsers / Devices / OS ring charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <RingBreakdownCard
            title="Browsers"
            subtitle="Visitors by browser"
            loading={loading}
            items={(data?.browsers ?? []).map((b) => ({ name: b.browser, count: b.count }))}
            renderIcon={(name) => <BrowserIcon browser={name} size={14} className="shrink-0" />}
          />
          <RingBreakdownCard
            title="Devices"
            subtitle="Visitors by device type"
            loading={loading}
            items={(data?.devices ?? []).map((d) => ({ name: d.device, count: d.count }))}
            renderIcon={(name) => <DeviceIcon device={name} size={14} className="shrink-0" />}
            capitalize
          />
          <RingBreakdownCard
            title="Operating Systems"
            subtitle="Visitors by OS"
            loading={loading}
            items={(data?.os ?? []).map((o) => ({ name: o.os, count: o.count }))}
            renderIcon={(name) => <OsIcon os={name} size={14} className="shrink-0" />}
          />
        </div>

        {/* Top Countries / Top Pages ring charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RingBreakdownCard
            title="Top Countries"
            subtitle="Visitors by country"
            layout="side"
            loading={loading}
            items={(data?.topCountries ?? []).map((c) => ({ name: c.country, count: c.count }))}
            renderIcon={(name) => <CountryFlag countryCode={name} size={16} />}
          />
          <RingBreakdownCard
            title="Top Pages"
            subtitle="Most visited pages"
            layout="side"
            loading={loading}
            items={(data?.topPages ?? []).map((p) => ({ name: p.page, count: p.count }))}
          />
        </div>

        {/* Top referrers / Traffic sources */}
        <div className="grid gap-4 lg:grid-cols-2">
          <BarBreakdownCard
            title="Top Referrers"
            subtitle="External sites sending traffic"
            loading={loading}
            items={(data?.topReferrers ?? []).map((r) => ({ name: r.referrer, count: r.count }))}
            emptyText="No referrer data yet"
          />
          <BarBreakdownCard
            title="Traffic Sources"
            subtitle="UTM source breakdown"
            loading={loading}
            items={(data?.trafficSources ?? []).map((s) => ({ name: s.source, count: s.count }))}
            emptyText="No UTM data yet"
          />
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

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string | null
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          <span className="text-muted-foreground/70">{icon}</span>
        </div>
        <div className="text-2xl font-bold mt-2 tabular-nums">
          {value == null ? <Skeleton className="h-7 w-20" /> : value}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
      No data in this range
    </div>
  )
}

interface BreakdownItem {
  name: string
  count: number
}

function RingBreakdownCard({
  title,
  subtitle,
  loading,
  items,
  renderIcon,
  capitalize,
  layout = "stacked",
}: {
  title: string
  subtitle: string
  loading: boolean
  items: BreakdownItem[]
  renderIcon?: (name: string) => React.ReactNode
  capitalize?: boolean
  layout?: "stacked" | "side"
}) {
  const top = items.slice(0, 6)
  const total = top.reduce((s, i) => s + i.count, 0)
  const maxVal = Math.max(...top.map((i) => i.count), 1)
  const ringData = top.map((i, idx) => ({
    label: i.name,
    value: i.count,
    maxValue: maxVal,
    color: CHART_COLORS[idx % CHART_COLORS.length] ?? "var(--chart-1)",
  }))

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-5">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mb-4">{subtitle}</div>
      {loading ? (
        <div className="space-y-3 py-4">
          <Skeleton className="h-32 w-32 rounded-full mx-auto" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : top.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No data</div>
      ) : layout === "side" ? (
        <div className="flex items-start gap-6">
          <div className="shrink-0">
            <RingChart data={ringData} size={200} strokeWidth={10} ringGap={4} baseInnerRadius={45}>
              {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
              <RingCenter defaultLabel="Total" valueClassName="text-xl font-bold" labelClassName="text-[10px]" />
            </RingChart>
          </div>
          <div className="flex-1 space-y-2.5 min-w-0 pt-2">
            {top.map((item, i) => (
              <BreakdownRow
                key={item.name}
                item={item}
                index={i}
                total={total}
                renderIcon={renderIcon}
                capitalize={capitalize}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <RingChart data={ringData} size={220} strokeWidth={10} ringGap={4} baseInnerRadius={50}>
            {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
            <RingCenter defaultLabel="" valueClassName="text-2xl font-bold" labelClassName="text-[10px]" />
          </RingChart>
          <div className="w-full space-y-2.5">
            {top.map((item, i) => (
              <BreakdownRow
                key={item.name}
                item={item}
                index={i}
                total={total}
                renderIcon={renderIcon}
                capitalize={capitalize}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownRow({
  item,
  index,
  total,
  renderIcon,
  capitalize,
}: {
  item: BreakdownItem
  index: number
  total: number
  renderIcon?: (name: string) => React.ReactNode
  capitalize?: boolean
}) {
  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
  const color = `var(--chart-${(index % 5) + 1})`
  return (
    <div>
      <div className="flex items-center gap-2 text-sm mb-1">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
        {renderIcon ? renderIcon(item.name) : null}
        <span className={`truncate font-medium ${capitalize ? "capitalize" : ""}`} title={item.name}>
          {item.name}
        </span>
        <span className="ml-auto text-muted-foreground tabular-nums text-xs">
          {item.count.toLocaleString()}
        </span>
        <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full ml-5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function BarBreakdownCard({
  title,
  subtitle,
  loading,
  items,
  emptyText,
}: {
  title: string
  subtitle: string
  loading: boolean
  items: BreakdownItem[]
  emptyText: string
}) {
  const max = items.reduce((m, x) => Math.max(m, x.count), 0) || 1
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-5">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mb-4">{subtitle}</div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 8).map((it) => (
            <div key={it.name} className="relative">
              <div
                className="absolute inset-y-0 left-0 bg-primary/15 rounded-sm"
                style={{ width: `${Math.round((it.count / max) * 100)}%` }}
              />
              <div className="relative flex items-center justify-between gap-2 px-1.5 py-1 text-xs">
                <span className="truncate">{it.name}</span>
                <span className="tabular-nums text-muted-foreground">{it.count.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
