import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  IconUsers,
  IconExternalLink,
  IconClick,
  IconEye,
  IconActivity,
  IconClock,
  IconArrowUpRight,
} from "@tabler/icons-react"
import { trpc } from "@/lib/trpc"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { CountryFlag } from "@/components/ui/country-flag"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/_app/sessions")({
  component: SessionsPage,
})

const RANGE_PRESETS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
] as const

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "—"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 1) return `${secs}s`
  if (mins < 60) return `${mins}m ${secs}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, Math.floor((now - ts) / 1000))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function SessionsPage() {
  // No website selected by default — listing all sites at once is expensive.
  // User must pick a site (or explicitly choose "All websites") before any
  // session list query fires.
  const [websiteId, setWebsiteId] = useState<string>("")
  const [days, setDays] = useState<number>(7)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [openSessionKey, setOpenSessionKey] = useState<string | null>(null)

  // Debounce search input
  useMemo(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: websitesData } = trpc.websites.optimized.useQuery()
  const websites = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : []
    return items.map((w) => ({ id: String(w.id), name: String(w.name) }))
  }, [websitesData])

  const range = useMemo(() => {
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    return { startDate: start.toISOString(), endDate: end.toISOString() }
  }, [days])

  const hasSelection = websiteId !== ""
  const pageSize = 50
  const { data, isLoading, isFetching } = trpc.sessions.list.useQuery(
    {
      websiteId: websiteId === "all" ? undefined : websiteId,
      startDate: range.startDate,
      endDate: range.endDate,
      search: debouncedSearch || undefined,
      page,
      pageSize,
    },
    { enabled: hasSelection },
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const open = openSessionKey
    ? (() => {
        const [w, s] = openSessionKey.split("::")
        return { websiteId: w!, sessionId: s! }
      })()
    : null

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <Select value={websiteId} onValueChange={(v) => { setWebsiteId(v); setPage(1) }}>
          <SelectTrigger className="md:w-56">
            <SelectValue placeholder="Select a website…" />
          </SelectTrigger>
          <SelectContent>
            {websites.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
            <SelectItem value="all">All websites</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); setPage(1) }}>
          <SelectTrigger className="md:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by country, city, browser, OS, device, id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:flex-1"
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="px-3 py-2 font-medium">Visitor</th>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Browser</th>
                <th className="px-3 py-2 font-medium">OS</th>
                <th className="px-3 py-2 font-medium">Device</th>
                <th className="px-3 py-2 font-medium text-right">Views</th>
                <th className="px-3 py-2 font-medium text-right">Events</th>
                <th className="px-3 py-2 font-medium text-right">Duration</th>
                <th className="px-3 py-2 font-medium text-right">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {!hasSelection ? (
                <tr><td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">Select a website to view sessions.</td></tr>
              ) : isFetching ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b last:border-b-0">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <Skeleton className={j >= 6 ? "h-3.5 w-12 ml-auto" : "h-3.5 w-full max-w-[120px]"} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">No sessions in this range.</td></tr>
              ) : items.map((s) => (
                <tr
                  key={`${s.websiteId}::${s.sessionId}`}
                  className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                  onClick={() => setOpenSessionKey(`${s.websiteId}::${s.sessionId}`)}
                >
                  <td className="px-3 py-2 font-mono text-xs">{s.visitorId.slice(0, 10)}</td>
                  <td className="px-3 py-2 truncate max-w-[160px]" title={s.websiteName ?? ""}>{s.websiteName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <CountryFlag countryCode={s.country ?? undefined} size={16} />
                      <span className="text-xs">{s.city ?? s.country ?? "—"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{s.browser ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.os ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.device ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.views}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.events}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(s.duration)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{formatRelative(s.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total.toLocaleString()} sessions</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <SessionDetailSheet
        websiteId={open?.websiteId ?? null}
        sessionId={open?.sessionId ?? null}
        onClose={() => setOpenSessionKey(null)}
      />
    </div>
  )
}

interface SheetProps {
  websiteId: string | null
  sessionId: string | null
  onClose: () => void
}

function SessionDetailSheet({ websiteId, sessionId, onClose }: SheetProps) {
  const isOpen = !!(websiteId && sessionId)
  const enabled = isOpen

  const sessionQuery = trpc.sessions.byId.useQuery(
    { websiteId: websiteId!, sessionId: sessionId! },
    { enabled }
  )
  const activityQuery = trpc.sessions.activity.useQuery(
    { websiteId: websiteId!, sessionId: sessionId! },
    { enabled }
  )

  const session = sessionQuery.data
  const activity = activityQuery.data ?? []

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <IconUsers size={18} />
            Session details
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {sessionId ? sessionId.slice(0, 16) + "…" : ""}
          </SheetDescription>
        </SheetHeader>

        {!session ? (
          sessionQuery.isLoading ? (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-2 w-12" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="space-y-2 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Session not found.</div>
          )
        ) : (
          <div className="space-y-4 p-4">
            {/* Profile */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Field label="Visitor" value={<span className="font-mono">{session.visitorId.slice(0, 12)}…</span>} />
              <Field label="Website" value={session.websiteName ?? "—"} />
              <Field
                label="Location"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <CountryFlag countryCode={session.country ?? undefined} size={14} />
                    {[session.city, session.country].filter(Boolean).join(", ") || "—"}
                  </span>
                }
              />
              <Field label="Browser" value={session.browser ?? "—"} />
              <Field label="OS" value={session.os ?? "—"} />
              <Field label="Device" value={session.device ?? "—"} />
              <Field label="Language" value={session.language ?? "—"} />
              <Field
                label="Source"
                value={session.source ?? session.referrerDomain ?? "Direct"}
              />
              <Field label="Landing" value={<TruncatedPath path={session.landingPage} />} />
              <Field label="Exit" value={<TruncatedPath path={session.exitPage} />} />
              <Field label="Duration" value={formatDuration(session.duration)} />
              <Field
                label="Started"
                value={new Date(session.startTime).toLocaleString()}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Badge variant={session.isBounce ? "destructive" : "secondary"}>
                {session.isBounce ? "Bounce" : "Engaged"}
              </Badge>
              <Badge variant="secondary">
                <IconEye size={12} className="mr-1" /> {session.views} views
              </Badge>
              <Badge variant="secondary">
                <IconClick size={12} className="mr-1" /> {session.events} events
              </Badge>
            </div>

            {/* Activity timeline */}
            <div className="pt-2">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <IconActivity size={14} /> Activity
              </h3>
              {activityQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">No activity recorded.</p>
              ) : (
                <ol className="relative border-l border-border pl-4 space-y-3">
                  {activity.map((a, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary/80 ring-2 ring-background">
                      </span>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs">
                            {a.kind === "pageview" ? (
                              <IconArrowUpRight size={12} className="text-emerald-500 shrink-0" />
                            ) : (
                              <IconClick size={12} className="text-amber-500 shrink-0" />
                            )}
                            <span className="font-medium truncate">
                              {a.kind === "pageview"
                                ? (a.title || a.page)
                                : (
                                  <>
                                    {humanizeKey(a.eventName ?? "event")}
                                    <span className="text-muted-foreground font-normal ml-1">
                                      ({humanizeKey(a.eventType ?? "custom")})
                                    </span>
                                  </>
                                )}
                            </span>
                          </div>
                          {a.kind === "pageview" ? (
                            <p className="text-xs text-muted-foreground font-mono truncate" title={a.page}>{a.page}</p>
                          ) : a.properties && Object.keys(a.properties).length > 0 ? (
                            <EventProperties properties={a.properties} />
                          ) : null}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
                          <IconClock size={10} />
                          {new Date(a.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  )
}

// Keys whose values represent durations in ms — render as "1234 ms"
const MS_KEYS = new Set([
  "loadtime",
  "firstpaint",
  "firstcontentfulpaint",
  "domcontentloaded",
  "timetointeractive",
  "ttfb",
  "lcp",
  "fcp",
  "fid",
  "inp",
  "duration",
  "responsetime",
])

const NAV_TYPE_LABELS: Record<number, string> = {
  0: "navigate",
  1: "reload",
  2: "back/forward",
  3: "prerender",
}

function formatPropertyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    const k = key.toLowerCase()
    if (k === "navigationtype" && NAV_TYPE_LABELS[value] !== undefined) {
      return `${value} (${NAV_TYPE_LABELS[value]})`
    }
    if (MS_KEYS.has(k)) {
      return value >= 1000
        ? `${(value / 1000).toFixed(2)} s`
        : `${Math.round(value)} ms`
    }
    return value.toLocaleString()
  }
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

function humanizeKey(key: string): string {
  // camelCase / snake_case → "Camel Case"
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function EventProperties({ properties }: { properties: Record<string, unknown> }) {
  const entries = Object.entries(properties)
  if (entries.length === 0) return null

  return (
    <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px] bg-muted/40 rounded px-2 py-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground truncate">{humanizeKey(k)}</dt>
          <dd
            className="font-mono tabular-nums truncate"
            title={typeof v === "object" ? JSON.stringify(v) : String(v)}
          >
            {formatPropertyValue(k, v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TruncatedPath({ path }: { path: string | null | undefined }) {
  if (!path) return <>—</>
  return (
    <span className="inline-flex items-center gap-1 max-w-full">
      <span className="font-mono truncate" title={path}>{path}</span>
      {path.startsWith("http") && (
        <IconExternalLink size={12} className="text-muted-foreground shrink-0" />
      )}
    </span>
  )
}
