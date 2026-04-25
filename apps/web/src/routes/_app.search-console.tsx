import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { IconWorldSearch, IconTrendingUp, IconClick, IconEye, IconTarget } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart";
import { Grid as VisxGrid } from "@/components/charts/grid";
import { XAxis as VisxXAxis } from "@/components/charts/x-axis";
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip";
import NumberFlow from "@number-flow/react";

export const Route = createFileRoute("/_app/search-console")({
  component: SearchConsolePage,
});

interface Website { id: string; name: string }

function SearchConsolePage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [period, setPeriod] = useState<string>("30");

  const { data: websitesData, isLoading: loadingWebsites } = trpc.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData.items : [];
    return items.map((w) => ({ id: String(w.id ?? ""), name: String(w.name ?? "") }));
  }, [websitesData]);

  if (!loadingWebsites && websites.length > 0 && !selectedWebsite) {
    setSelectedWebsite(websites[0]!.id);
  }

  const days = parseInt(period);

  const { data: summary, isLoading: loadingSummary } = trpc.searchConsole.getSummary.useQuery(
    { websiteId: selectedWebsite, days },
    { enabled: !!selectedWebsite }
  );

  const { data: timeSeries } = trpc.searchConsole.getTimeSeries.useQuery(
    { websiteId: selectedWebsite, days },
    { enabled: !!selectedWebsite }
  );

  const chartData = useMemo(() => {
    if (!timeSeries) return [];
    return timeSeries.map((d) => ({
      date: new Date(d.date + "T00:00:00Z"),
      clicks: d.clicks,
      impressions: d.impressions,
    }));
  }, [timeSeries]);

  const hasData = summary && (summary.totalClicks > 0 || summary.totalImpressions > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder="Select website" />
            </SelectTrigger>
            <SelectContent>
              {websites.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(loadingSummary || loadingWebsites) && (
        <div className="space-y-4">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      )}

      {!loadingSummary && !hasData && selectedWebsite && (
        <Card>
          <CardContent className="py-12 text-center">
            <IconWorldSearch size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No Search Console data for this website.</p>
            <p className="text-xs text-muted-foreground mt-1">Connect Google in Settings → Integrations, then sync Search Console in website settings.</p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <IconClick size={14} />
                  <p className="text-xs font-medium uppercase tracking-wider">Clicks</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  <NumberFlow value={summary!.totalClicks} />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <IconEye size={14} />
                  <p className="text-xs font-medium uppercase tracking-wider">Impressions</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  <NumberFlow value={summary!.totalImpressions} />
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <IconTrendingUp size={14} />
                  <p className="text-xs font-medium uppercase tracking-wider">Avg CTR</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">{summary!.avgCtr}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <IconTarget size={14} />
                  <p className="text-xs font-medium uppercase tracking-wider">Avg Position</p>
                </div>
                <p className="text-2xl font-bold tabular-nums">{summary!.avgPosition}</p>
              </CardContent>
            </Card>
          </div>

          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Clicks & Impressions</CardTitle>
              </CardHeader>
              <CardContent>
                <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                  <VisxGrid horizontal numTicksRows={4} />
                  <VisxArea dataKey="clicks" fill="var(--chart-1)" strokeWidth={2} />
                  <VisxArea dataKey="impressions" fill="var(--chart-2)" fillOpacity={0.15} strokeWidth={1.5} />
                  <VisxXAxis />
                  <VisxChartTooltip rows={(point) => [
                    { color: "var(--chart-1)", label: "Clicks", value: Number(point.clicks ?? 0).toLocaleString() },
                    { color: "var(--chart-2)", label: "Impressions", value: Number(point.impressions ?? 0).toLocaleString() },
                  ]} />
                </VisxAreaChart>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Top Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {summary!.topQueries.length > 0 ? (
                    <>
                      <div className="grid grid-cols-[1fr_60px_80px_50px_50px] gap-2 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b">
                        <span>Query</span>
                        <span className="text-right">Clicks</span>
                        <span className="text-right">Impressions</span>
                        <span className="text-right">CTR</span>
                        <span className="text-right">Pos</span>
                      </div>
                      {summary!.topQueries.map((q) => {
                        const maxClicks = summary!.topQueries[0]?.clicks ?? 1;
                        return (
                          <div key={q.query} className="group">
                            <div className="grid grid-cols-[1fr_60px_80px_50px_50px] gap-2 items-center text-sm py-1">
                              <span className="truncate text-foreground/90 font-medium" title={q.query}>{q.query}</span>
                              <span className="text-right tabular-nums text-muted-foreground">{q.clicks}</span>
                              <span className="text-right tabular-nums text-muted-foreground">{q.impressions.toLocaleString()}</span>
                              <span className="text-right tabular-nums text-muted-foreground">{q.ctr}%</span>
                              <span className={`text-right tabular-nums font-medium ${q.position <= 10 ? "text-green-500" : q.position <= 20 ? "text-yellow-500" : "text-muted-foreground"}`}>
                                {q.position}
                              </span>
                            </div>
                            <div className="h-0.5 bg-muted rounded-full">
                              <div className="h-full rounded-full bg-primary/60" style={{ width: `${(q.clicks / maxClicks) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No query data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Top Pages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {summary!.topPages.length > 0 ? (
                    <>
                      <div className="grid grid-cols-[1fr_60px_80px] gap-2 text-[10px] text-muted-foreground uppercase tracking-wider pb-1 border-b">
                        <span>Page</span>
                        <span className="text-right">Clicks</span>
                        <span className="text-right">Impressions</span>
                      </div>
                      {summary!.topPages.map((p) => {
                        const maxClicks = summary!.topPages[0]?.clicks ?? 1;
                        let displayPath = p.page;
                        try { displayPath = new URL(p.page).pathname; } catch { /* keep full */ }
                        return (
                          <div key={p.page} className="group">
                            <div className="grid grid-cols-[1fr_60px_80px] gap-2 items-center text-sm py-1">
                              <span className="truncate text-foreground/90 font-mono text-xs" title={p.page}>{displayPath}</span>
                              <span className="text-right tabular-nums text-muted-foreground">{p.clicks}</span>
                              <span className="text-right tabular-nums text-muted-foreground">{p.impressions.toLocaleString()}</span>
                            </div>
                            <div className="h-0.5 bg-muted rounded-full">
                              <div className="h-full rounded-full bg-chart-2/60" style={{ width: `${(p.clicks / maxClicks) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No page data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
