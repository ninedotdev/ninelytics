"use client";

import { useState } from "react";
import {
  IconGauge,
  IconCircleCheck,
  IconCircleX,
  IconAlertCircle,
  IconArrowUpRight,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/app-layout";
import { api } from "@/utils/trpc";
import { skipToken } from "@tanstack/react-query";
import { sileo } from "sileo";
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart";
import { Grid as VisxGrid } from "@/components/charts/grid";
import { XAxis as VisxXAxis } from "@/components/charts/x-axis";
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "24h" | "7d" | "30d";
type DeviceFilter = "all" | "mobile" | "tablet" | "desktop";
type VitalName = "LCP" | "FCP" | "INP" | "CLS" | "TTFB";
type Rating = "good" | "needs-improvement" | "poor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VITAL_LABELS: Record<VitalName, { label: string; description: string; unit: string }> = {
  LCP:  { label: "LCP",  description: "Largest Contentful Paint", unit: "ms" },
  FCP:  { label: "FCP",  description: "First Contentful Paint",   unit: "ms" },
  INP:  { label: "INP",  description: "Interaction to Next Paint", unit: "ms" },
  CLS:  { label: "CLS",  description: "Cumulative Layout Shift",  unit: "" },
  TTFB: { label: "TTFB", description: "Time to First Byte",       unit: "ms" },
};

const VITAL_ORDER: VitalName[] = ["LCP", "FCP", "INP", "CLS", "TTFB"];

function getRatingColor(rating: Rating | string): string {
  if (rating === "good") return "text-green-600 dark:text-green-400";
  if (rating === "needs-improvement") return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getRatingBadgeVariant(rating: Rating | string): "default" | "secondary" | "destructive" | "outline" {
  if (rating === "good") return "default";
  if (rating === "needs-improvement") return "secondary";
  return "destructive";
}

function getRatingIcon(rating: Rating | string) {
  if (rating === "good") return <IconCircleCheck size={14} className="text-green-500" />;
  if (rating === "needs-improvement") return <IconAlertCircle size={14} className="text-yellow-500" />;
  return <IconCircleX size={14} className="text-red-500" />;
}

function getRESRating(res: number): { label: string; color: string } {
  if (res >= 90) return { label: "Excellent", color: "text-green-600 dark:text-green-400" };
  if (res >= 75) return { label: "Good",      color: "text-green-600 dark:text-green-400" };
  if (res >= 50) return { label: "Needs work", color: "text-yellow-600 dark:text-yellow-400" };
  return { label: "Poor",     color: "text-red-600 dark:text-red-400" };
}

function formatValue(name: VitalName, p75: number): string {
  if (name === "CLS") return (p75 / 1000).toFixed(3);
  if (p75 >= 1000) return `${(p75 / 1000).toFixed(1)}s`;
  return `${p75}ms`;
}

function vitalRating(name: VitalName, p75: number): Rating {
  const t: Record<VitalName, { good: number; poor: number }> = {
    LCP:  { good: 2500,  poor: 4000  },
    FCP:  { good: 1800,  poor: 3000  },
    INP:  { good: 200,   poor: 500   },
    CLS:  { good: 100,   poor: 250   }, // already stored * 1000
    TTFB: { good: 800,   poor: 1800  },
  };
  const { good, poor } = t[name];
  if (p75 <= good) return "good";
  if (p75 <= poor) return "needs-improvement";
  return "poor";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SpeedInsightsPage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [period, setPeriod] = useState<Period>("7d");
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>("all");
  const [selectedVital, setSelectedVital] = useState<VitalName>("LCP");

  // Website list
  const { data: websitesData } = api.websites.optimized.useQuery({ page: 1, pageSize: 100 });
  const websites: Array<{ id: string; name: string }> = (websitesData?.items ?? []) as Array<{ id: string; name: string }>;
  const effectiveWebsite: string = selectedWebsite;

  // Speed Insights status for selected website
  const { data: statusData } = api.speedInsights.getStatus.useQuery(
    effectiveWebsite ? { websiteId: effectiveWebsite } : skipToken
  );
  const isEnabled = statusData?.enabled ?? false;

  // Summary (vital cards + RES) — auto-refresh every 30s
  const { data: summary, isLoading: summaryLoading } = api.speedInsights.getSummary.useQuery(
    effectiveWebsite && isEnabled
      ? { websiteId: effectiveWebsite, period, deviceType: deviceFilter }
      : skipToken,
    { refetchInterval: 30_000 }
  );

  // Time series for chart
  const { data: timeSeries, isLoading: timeSeriesLoading } = api.speedInsights.getTimeSeries.useQuery(
    effectiveWebsite && isEnabled
      ? { websiteId: effectiveWebsite, vitalName: selectedVital, period }
      : skipToken,
    { refetchInterval: 30_000 }
  );

  // Worst pages
  const { data: worstPages, isLoading: worstPagesLoading } = api.speedInsights.getWorstPages.useQuery(
    effectiveWebsite && isEnabled
      ? { websiteId: effectiveWebsite, vitalName: selectedVital, period }
      : skipToken,
    { refetchInterval: 30_000 }
  );

  // Toggle mutation
  const utils = api.useUtils();
  const toggle = api.speedInsights.toggle.useMutation({
    onSuccess(_, variables) {
      sileo.success({ title: variables.enabled ? "Speed Insights enabled" : "Speed Insights disabled" });
      utils.speedInsights.getStatus.invalidate({ websiteId: effectiveWebsite });
    },
    onError(error) {
      sileo.error({ title: error.message || "Failed to update" });
    },
  });

  const hasData = (summary?.vitals?.length ?? 0) > 0;

  // Chart data
  const chartData = (timeSeries ?? []).map((row) => ({
    date: new Date(row.date),
    p75: row.p75,
  }));

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <IconGauge size={20} className="text-muted-foreground" />
            <h1 className="text-lg font-semibold">Speed Insights</h1>
          </div>

          {/* Website selector */}
          <Select value={effectiveWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a website" />
            </SelectTrigger>
            <SelectContent>
              {websites.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Period */}
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          {/* Device */}
          <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v as DeviceFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* No website selected */}
        {!effectiveWebsite && (
          <Card>
            <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
              Select a website to view Speed Insights
            </CardContent>
          </Card>
        )}

        {/* Not enabled */}
        {effectiveWebsite && !isEnabled && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <IconGauge size={40} className="text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-semibold text-base">Speed Insights is not enabled</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Collect Core Web Vitals from real user sessions with zero performance impact — native browser APIs, no extra libraries.
                </p>
              </div>
              <Button
                onClick={() => toggle.mutate({ websiteId: effectiveWebsite, enabled: true })}
                disabled={toggle.isPending}
              >
                {toggle.isPending ? (
                  <IconLoader2 size={16} className="mr-2 animate-spin" />
                ) : (
                  <IconGauge size={16} className="mr-2" />
                )}
                Enable Speed Insights
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Enabled but no data yet */}
        {effectiveWebsite && isEnabled && !summaryLoading && !hasData && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <IconLoader2 size={32} className="text-muted-foreground animate-spin" />
              <div className="space-y-1">
                <p className="font-semibold">Collecting data...</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Web Vitals will appear once your visitors start loading pages. This usually takes a few minutes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {effectiveWebsite && isEnabled && summaryLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {VITAL_ORDER.map((v) => (
                <Skeleton key={v} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-lg" />
          </div>
        )}

        {/* Main content */}
        {effectiveWebsite && isEnabled && !summaryLoading && hasData && (
          <div className="space-y-6">
            {/* Real Experience Score */}
            <Card>
              <CardContent className="p-6 flex items-center gap-6">
                {/* Ring gauge */}
                <div className="flex-shrink-0 relative w-24 h-24">
                  <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                      className="stroke-muted/40" />
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                      strokeLinecap="round"
                      stroke={summary!.res >= 75 ? "var(--color-green-500)" : summary!.res >= 50 ? "var(--color-yellow-500)" : "var(--color-red-500)"}
                      style={{ stroke: summary!.res >= 75 ? "#22c55e" : summary!.res >= 50 ? "#eab308" : "#ef4444" }}
                      strokeDasharray={`${summary!.res} ${100 - summary!.res}`}
                      strokeDashoffset="0" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold tabular-nums leading-none ${getRESRating(summary!.res).color}`}>
                      {summary!.res}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-base">Real Experience Score</p>
                  <p className={`text-sm font-medium ${getRESRating(summary!.res).color}`}>
                    {getRESRating(summary!.res).label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Weighted p75 across LCP (35%), INP (30%), FCP (15%), CLS (15%), TTFB (5%)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Vital Cards — radial gauges */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {VITAL_ORDER.map((vitalName) => {
                const vital = summary!.vitals.find((v) => v.name === vitalName);
                const info = VITAL_LABELS[vitalName];
                if (!vital) {
                  return (
                    <Card key={vitalName} className="opacity-50">
                      <CardContent className="p-5 flex flex-col items-center text-center">
                        <p className="text-xs font-mono font-semibold text-muted-foreground">{info.label}</p>
                        <div className="relative w-24 h-24 mt-2"><svg viewBox="0 0 36 36" className="w-24 h-24"><circle cx="18" cy="18" r="14" fill="none" strokeWidth="2.5" className="stroke-muted/20" /></svg></div>
                        <p className="text-lg font-bold mt-1">—</p>
                      </CardContent>
                    </Card>
                  );
                }
                const rating = vitalRating(vitalName, vital.p75);
                const goodPct = Math.round(Math.min(vital.goodPct, 100) * 10) / 10;
                const poorPct = Math.round(Math.min(vital.poorPct ?? 0, 100) * 10) / 10;
                const needsPct = Math.round(Math.max(0, 100 - goodPct - poorPct) * 10) / 10;

                // SVG ring math: circumference of r=14 = 2*PI*14 ≈ 87.96
                const C = 2 * Math.PI * 14;
                const goodArc = (goodPct / 100) * C;
                const needsArc = (needsPct / 100) * C;
                const poorArc = (poorPct / 100) * C;

                return (
                  <Card
                    key={vitalName}
                    className={`cursor-pointer transition-all ${selectedVital === vitalName ? "ring-2 ring-primary" : "hover:border-foreground/20"}`}
                    onClick={() => setSelectedVital(vitalName)}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center">
                      <p className="text-[11px] font-mono font-semibold text-muted-foreground tracking-wide">{info.label}</p>

                      {/* Multi-segment radial gauge */}
                      <div className="relative w-32 h-32 my-3">
                        <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                          {/* Background track */}
                          <circle cx="18" cy="18" r="14" fill="none" strokeWidth="2.5" className="stroke-muted/15" />
                          {/* Good (green) */}
                          <circle cx="18" cy="18" r="14" fill="none" strokeWidth="2.5"
                            stroke="#22c55e"
                            strokeDasharray={`${goodArc} ${C - goodArc}`}
                            strokeDashoffset="0"
                            style={{ transition: "stroke-dasharray 0.8s ease" }}
                          />
                          {/* Needs improvement (yellow) */}
                          {needsPct > 0 && (
                            <circle cx="18" cy="18" r="14" fill="none" strokeWidth="2.5"
                              stroke="#eab308"
                              strokeDasharray={`${needsArc} ${C - needsArc}`}
                              strokeDashoffset={`${-goodArc}`}
                              style={{ transition: "stroke-dasharray 0.8s ease" }}
                            />
                          )}
                          {/* Poor (red) */}
                          {poorPct > 0 && (
                            <circle cx="18" cy="18" r="14" fill="none" strokeWidth="2.5"
                              stroke="#ef4444"
                              strokeDasharray={`${poorArc} ${C - poorArc}`}
                              strokeDashoffset={`${-(goodArc + needsArc)}`}
                              style={{ transition: "stroke-dasharray 0.8s ease" }}
                            />
                          )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-lg font-bold tabular-nums leading-none ${getRatingColor(rating)}`}>
                            {formatValue(vitalName, vital.p75)}
                          </span>
                          <span className="text-[9px] text-muted-foreground mt-0.5">p75</span>
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{goodPct}%</span>
                        {needsPct > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />{needsPct}%</span>}
                        {poorPct > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{poorPct}%</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Chart + Worst Pages */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Time series chart */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {VITAL_LABELS[selectedVital].description} over time
                    </CardTitle>
                    <Tabs value={selectedVital} onValueChange={(v) => setSelectedVital(v as VitalName)}>
                      <TabsList className="h-7">
                        {VITAL_ORDER.map((v) => (
                          <TabsTab key={v} value={v} className="text-xs px-2 h-6">{v}</TabsTab>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                  <CardDescription className="text-xs">
                    Daily p75 — lower is better
                    {selectedVital !== "CLS" ? "" : " (CLS: closer to 0 is better)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeSeriesLoading ? (
                    <Skeleton className="h-48" />
                  ) : chartData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      No data for this period
                    </div>
                  ) : (
                    <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                      <VisxGrid horizontal numTicksRows={4} />
                      <VisxArea dataKey="p75" fill="var(--chart-1)" fillOpacity={0.3} strokeWidth={2} />
                      <VisxXAxis />
                      <VisxChartTooltip
                        rows={(point) => [
                          {
                            color: "var(--chart-1)",
                            label: `${selectedVital} p75`,
                            value: formatValue(selectedVital, point.p75 as number),
                          },
                        ]}
                      />
                    </VisxAreaChart>
                  )}
                </CardContent>
              </Card>

              {/* Worst pages */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Slowest pages by {selectedVital}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Pages with ≥ 5 samples, ordered by p75
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {worstPagesLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
                    </div>
                  ) : !worstPages || worstPages.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      Not enough data yet (need ≥ 5 samples per page)
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {worstPages.map((page) => {
                        const rating = vitalRating(selectedVital, page.p75);
                        return (
                          <div
                            key={page.path}
                            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-mono truncate text-xs">{page.path}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`font-semibold tabular-nums text-xs ${getRatingColor(rating)}`}>
                                {formatValue(selectedVital, page.p75)}
                              </span>
                              <span className="text-xs text-muted-foreground">{page.poorPct}% poor</span>
                              <span className="text-xs text-muted-foreground opacity-60">{page.count} samples</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
