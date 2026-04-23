import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from "react";
import { IconTrendingUp, IconUsers, IconEye, IconClock } from "@tabler/icons-react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ChartConfig,
} from "@/components/ui/chart";
import { sileo } from "sileo";
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart";
import { Grid as VisxGrid } from "@/components/charts/grid";
import { XAxis as VisxXAxis } from "@/components/charts/x-axis";
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconCalendar } from "@tabler/icons-react";
import type { DateRange } from "react-day-picker";
import NumberFlow from "@number-flow/react";
import {
  AdvancedFilters,
  FilterValues,
} from "@/components/analytics/advanced-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconDownload, IconFileText, IconTable } from "@tabler/icons-react";
import {
  generateCSV,
  generateJSON,
  generateExcelCSV,
  formatAnalyticsForExport,
  formatDeviceDataForExport,
  formatTopPagesForExport,
} from "@/lib/export-helpers";
import { BrowserIcon } from "@/components/ui/browser-icon";
import { DeviceIcon } from "@/components/ui/device-icon";
import { OsIcon } from "@/components/ui/os-icon";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { CountryFlag } from "@/components/ui/country-flag";
import { SourceIcon } from "@/components/ui/source-icon";

export const Route = createFileRoute('/_app/analytics')({
  validateSearch: (s: Record<string, unknown>) => ({
    website: typeof s.website === 'string' ? s.website : undefined,
    tab: typeof s.tab === 'string' ? s.tab : undefined,
  }),
  component: AnalyticsPage,
})

interface Website {
  id: string;
  name: string;
  url: string;
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

const C1 = "#10b981"; // emerald  — Page Views
const C2 = "#3b82f6"; // blue     — Unique Visitors
const C3 = "#f59e0b"; // amber    — Bounce Rate
const C4 = "#8b5cf6"; // purple   — Avg Session

function AnalyticsContent() {
  const search = useSearch({ strict: false }) as { website?: string; tab?: string };
  const navigate = useNavigate();
  const preselectedWebsite = search.website ?? null;
  const activeTab = search.tab || "overview";

  const { data: websitesData, isLoading: loadingWebsites } = trpc.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData?.items : [];
    return items.map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? ""),
      url: String(w.url ?? ""),
    }));
  }, [websitesData]);

  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [datePickerRange, setDatePickerRange] = useState<DateRange | undefined>(undefined);
  const [filters, setFilters] = useState<FilterValues>({});


  // Derive active website id; do not auto-select the first, only preselected or user choice
  const activeWebsiteId = useMemo(() => {
    if (selectedWebsite) return selectedWebsite;
    if (preselectedWebsite && websites.some((w) => w.id === preselectedWebsite)) {
      return preselectedWebsite;
    }
    return "";
  }, [selectedWebsite, preselectedWebsite, websites]);

  const { startDate, endDate } = useMemo(() => {
    const from = datePickerRange?.from ?? new Date("2020-01-01");
    const to = datePickerRange?.to ?? new Date();
    return {
      startDate: from.toISOString().split("T")[0],
      endDate: to.toISOString().split("T")[0],
    };
  }, [datePickerRange]);

  const { data: analyticsResponse, isLoading: loadingAnalytics, refetch: refetchAnalytics } = trpc.analytics.overview.useQuery(
    {
      websiteId: activeWebsiteId,
      startDate: startDate,
      endDate: endDate,
      ...filters,
    },
    { enabled: !!activeWebsiteId, staleTime: 0, refetchOnMount: true }
  );

  const { data: deviceData = [], isLoading: loadingDevices, refetch: refetchDevices } = trpc.analytics.devices.useQuery(
    {
      websiteId: activeWebsiteId,
      startDate: startDate,
      endDate: endDate,
      ...filters,
    },
    { enabled: !!activeWebsiteId }
  );

  const { data: topPages = [], isLoading: loadingPages, refetch: refetchPages } = trpc.analytics.pages.useQuery(
    {
      websiteId: activeWebsiteId,
      startDate: startDate,
      endDate: endDate,
      limit: 5,
      ...filters,
    },
    { enabled: !!activeWebsiteId }
  );

  const { data: statsData } = trpc.analytics.stats.useQuery(
    { websiteId: activeWebsiteId, startDate, endDate },
    { enabled: !!activeWebsiteId }
  );

  const { data: trafficData } = trpc.analytics.traffic.useQuery(
    { websiteId: activeWebsiteId, startDate, endDate },
    { enabled: !!activeWebsiteId }
  );

  const analyticsData = useMemo(() => {
    return analyticsResponse?.data ?? [];
  }, [analyticsResponse?.data]);
  const metrics = analyticsResponse?.summary ?? {
    totalPageViews: 0,
    totalUniqueVisitors: 0,
    avgBounceRate: 0,
    avgSessionDuration: 0,
    trend: {
      pageViews: 0,
      uniqueVisitors: 0,
      bounceRate: 0,
      sessionDuration: 0,
    },
  };
  const loading = loadingWebsites || loadingAnalytics;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!activeWebsiteId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchAnalytics(),
        refetchDevices(),
        refetchPages(),
      ]);
    } catch {
      sileo.error({ title: "Failed to refresh analytics" });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Removed comparison logic - not needed

  // Export functions
  const handleExportAnalytics = (format: "csv" | "excel" | "json") => {
    if (!activeWebsiteId || analyticsData.length === 0) {
      sileo.error({ title: "No data to export" });
      return;
    }

    const website = websites.find((w) => w.id === activeWebsiteId);
    if (!website) return;

    const exportData = formatAnalyticsForExport(analyticsData, website.name, {
      start: startDate,
      end: endDate,
    });

    try {
      if (format === "csv") {
        generateCSV(exportData);
      } else if (format === "excel") {
        generateExcelCSV(exportData);
      } else if (format === "json") {
        generateJSON(exportData);
      }
      sileo.success({ title: `Exported as ${format.toUpperCase()}` });
    } catch (error) {
      console.error("Export error:", error);
      sileo.error({ title: "Failed to export data" });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportDevices = (format: "csv" | "excel" | "json") => {
    if (!activeWebsiteId || deviceData.length === 0) {
      sileo.error({ title: "No device data to export" });
      return;
    }

    const website = websites.find((w) => w.id === selectedWebsite);
    if (!website) return;

    const exportData = formatDeviceDataForExport(deviceData, website.name);

    try {
      if (format === "csv") {
        generateCSV(exportData);
      } else if (format === "excel") {
        generateExcelCSV(exportData);
      } else if (format === "json") {
        generateJSON(exportData);
      }
      sileo.success({ title: `Exported as ${format.toUpperCase()}` });
    } catch (error) {
      console.error("Export error:", error);
      sileo.error({ title: "Failed to export data" });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportTopPages = (format: "csv" | "excel" | "json") => {
    if (!activeWebsiteId || topPages.length === 0) {
      sileo.error({ title: "No top pages data to export" });
      return;
    }

    const website = websites.find((w) => w.id === selectedWebsite);
    if (!website) return;

    const exportData = formatTopPagesForExport(topPages, website.name);

    try {
      if (format === "csv") {
        generateCSV(exportData);
      } else if (format === "excel") {
        generateExcelCSV(exportData);
      } else if (format === "json") {
        generateJSON(exportData);
      }
      sileo.success({ title: `Exported as ${format.toUpperCase()}` });
    } catch (error) {
      console.error("Export error:", error);
      sileo.error({ title: "Failed to export data" });
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) {
      return <IconTrendingUp size={16} className="text-green-600" />;
    }
    return <IconTrendingUp size={16} className="text-red-600 rotate-180" />;
  };

  const getTrendColor = (trend: number) => {
    return trend > 0 ? "text-green-600" : "text-red-600";
  };

  // Prepare data for charts - ensure sorted by date and format properly
  const chartData = useMemo(() => {
    const sorted = [...analyticsData].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    return sorted.map((item) => ({
      ...item,
      date: new Date(item.date + "T00:00:00Z"),
      dateLabel: new Date(item.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [analyticsData]);

  // Add colors to device data for the pie chart
  const deviceDataWithColors = deviceData.map((device, index) => ({
    ...device,
    color: COLORS[index % COLORS.length],
  }));

  // Chart configurations for shadcn charts
  const pageViewsChartConfig = {
    pageViews: { label: "Page Views", color: C1 },
  } satisfies ChartConfig;

  const visitorsChartConfig = {
    uniqueVisitors: { label: "Unique Visitors", color: C2 },
  } satisfies ChartConfig;

  // Unique IDs for gradients to avoid conflicts
  const pageViewsGradientId = `fillPageViews-${activeWebsiteId || 'default'}`;
  const uniqueVisitorsGradientId = `fillUniqueVisitors-${activeWebsiteId || 'default'}`;
  const bounceRateGradientId = `fillBounceRate-${activeWebsiteId || 'default'}`;
  const avgSessionDurationGradientId = `fillAvgSessionDuration-${activeWebsiteId || 'default'}`;

  const deviceChartConfig = deviceDataWithColors.reduce((acc, device) => {
    const key = device.name.toLowerCase().replace(/\s+/g, "");
    acc[key] = {
      label: device.name,
      color: device.color,
    };
    return acc;
  }, {} as ChartConfig);

  const bounceDurationChartConfig = {
    bounceRate: { label: "Bounce Rate %", color: C3 },
    avgSessionDuration: { label: "Avg Session (s)", color: C4 },
  } satisfies ChartConfig;

  if (loading && websites.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-[200px]" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-[140px]" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[350px]" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <Select value={activeWebsiteId} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select website" />
            </SelectTrigger>
            <SelectContent>
              {websites.map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs font-normal">
                <IconCalendar size={14} />
                {datePickerRange?.from
                  ? `${datePickerRange.from.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} – ${(datePickerRange.to ?? new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                  : "All time"
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex gap-1 p-2 border-b">
                {[
                  { label: "7d", days: 7 },
                  { label: "30d", days: 30 },
                  { label: "90d", days: 90 },
                  { label: "1y", days: 365 },
                  { label: "All", days: 0 },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (preset.days === 0) {
                        setDatePickerRange(undefined);
                      } else {
                        const to = new Date();
                        const from = new Date(Date.now() - preset.days * 86400000);
                        setDatePickerRange({ from, to });
                      }
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Calendar
                mode="range"
                selected={datePickerRange}
                onSelect={setDatePickerRange}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="gap-2"
          >
            {isRefreshing ? <Spinner size={14} /> : null}
            Refresh
          </Button>

          {activeWebsiteId && analyticsData.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <IconDownload size={16} />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleExportAnalytics("csv")}
                >
                  <IconFileText size={16} className="mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportAnalytics("excel")}
                >
                  <IconTable size={16} className="mr-2" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportAnalytics("json")}
                >
                  <IconFileText size={16} className="mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      {activeWebsiteId && (
        <div className="flex gap-1 border-b">
          {[
            { key: "overview", label: "Overview" },
            { key: "funnels", label: "Funnels" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                navigate({
                  to: "/analytics",
                  search: {
                    website: search.website,
                    tab: tab.key === "overview" ? undefined : tab.key,
                  },
                  replace: true,
                });
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "funnels" && activeWebsiteId ? (
        <FunnelsTab websiteId={activeWebsiteId} />
      ) : (
      <>
      {/* Advanced Filters */}
      {activeWebsiteId && (
        <div className="mt-2">
          <AdvancedFilters
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
            }}
          />
        </div>
      )}

      {/* Key Metrics as list items */}
      {activeWebsiteId && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Page Views</span>
              <IconEye size={16} />
            </div>
            <div className="text-2xl font-bold mt-2">
              <NumberFlow value={metrics.totalPageViews} format={{ useGrouping: true }} />
            </div>
            {metrics.trend.pageViews !== 0 && (
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {getTrendIcon(metrics.trend.pageViews)}
                <span className={`ml-1 ${getTrendColor(metrics.trend.pageViews)}`}>
                  {Math.abs(metrics.trend.pageViews).toFixed(1)}%
                </span>
                <span className="ml-1">vs previous period</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Unique Visitors</span>
              <IconUsers size={16} />
            </div>
            <div className="text-2xl font-bold mt-2">
              <NumberFlow value={metrics.totalUniqueVisitors} format={{ useGrouping: true }} />
            </div>
            {metrics.trend.uniqueVisitors !== 0 && (
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {getTrendIcon(metrics.trend.uniqueVisitors)}
                <span className={`ml-1 ${getTrendColor(metrics.trend.uniqueVisitors)}`}>
                  {Math.abs(metrics.trend.uniqueVisitors).toFixed(1)}%
                </span>
                <span className="ml-1">vs previous period</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Bounce Rate</span>
              <IconTrendingUp size={16} />
            </div>
            <div className="text-2xl font-bold mt-2">
              <NumberFlow
                value={metrics.avgBounceRate}
                format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                suffix="%"
              />
            </div>
            {metrics.trend.bounceRate !== 0 && (
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {getTrendIcon(-metrics.trend.bounceRate)}
                <span className={`ml-1 ${getTrendColor(-metrics.trend.bounceRate)}`}>
                  {Math.abs(metrics.trend.bounceRate).toFixed(1)}%
                </span>
                <span className="ml-1">vs previous period</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>Avg. Session</span>
              <IconClock size={16} />
            </div>
            <div className="text-2xl font-bold mt-2 tabular-nums">
              <NumberFlow value={Math.floor(metrics.avgSessionDuration / 60)} />
              :
              <NumberFlow
                value={Math.round(metrics.avgSessionDuration % 60)}
                format={{ minimumIntegerDigits: 2 }}
              />
            </div>
            {metrics.trend.sessionDuration !== 0 && (
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {getTrendIcon(metrics.trend.sessionDuration)}
                <span className={`ml-1 ${getTrendColor(metrics.trend.sessionDuration)}`}>
                  {Math.abs(metrics.trend.sessionDuration).toFixed(1)}%
                </span>
                <span className="ml-1">vs previous period</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts as list sections (no cards) */}
      {activeWebsiteId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">Page Views Over Time</div>
            <div className="text-xs text-muted-foreground mb-2">Daily page views for the selected period</div>
            {chartData.length > 0 ? (
              <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                <VisxGrid horizontal numTicksRows={4} />
                <VisxArea dataKey="pageViews" fill="var(--chart-1)" fillOpacity={0.4} strokeWidth={2} />
                <VisxXAxis />
                <VisxChartTooltip
                  rows={(point) => [
                    { color: "var(--chart-1)", label: "Page Views", value: (point.pageViews as number)?.toLocaleString() ?? "0" },
                  ]}
                />
              </VisxAreaChart>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available for the selected period
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="text-sm font-medium text-foreground">Unique Visitors</div>
            <div className="text-xs text-muted-foreground mb-2">Daily unique visitors trend</div>
            {chartData.length > 0 ? (
              <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                <VisxGrid horizontal numTicksRows={4} />
                <VisxArea dataKey="uniqueVisitors" fill="var(--chart-2)" fillOpacity={0.4} strokeWidth={2} />
                <VisxXAxis />
                <VisxChartTooltip
                  rows={(point) => [
                    { color: "var(--chart-2)", label: "Visitors", value: (point.uniqueVisitors as number)?.toLocaleString() ?? "0" },
                  ]}
                />
              </VisxAreaChart>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data available for the selected period
              </div>
            )}
          </div>

        </div>
      )}

      {/* Browser, Device, OS Ring Charts */}
      {activeWebsiteId && (
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "Browsers",
              subtitle: "Visitors by browser",
              items: ((statsData as unknown as { browserBreakdown?: Array<{ browser: string; count: number }> })?.browserBreakdown ?? []).map(b => ({ name: b.browser, count: b.count })),
              icon: (name: string, i: number) => <BrowserIcon browser={name} size={14} className="shrink-0" />,
              empty: "No browser data",
            },
            {
              title: "Devices",
              subtitle: "Visitors by device type",
              items: (statsData?.deviceBreakdown ?? []).map(d => ({ name: d.device, count: d.count })),
              icon: (name: string) => <DeviceIcon device={name} size={14} className="shrink-0" />,
              empty: "No device data",
              capitalize: true,
            },
            {
              title: "Operating Systems",
              subtitle: "Visitors by OS",
              items: ((statsData as unknown as { osBreakdown?: Array<{ os: string; count: number }> })?.osBreakdown ?? []).map(o => ({ name: o.os, count: o.count })),
              icon: (name: string) => <OsIcon os={name} size={14} className="shrink-0" />,
              empty: "No OS data",
            },
          ].map((section) => (
            <div key={section.title} className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-sm font-medium text-foreground">{section.title}</div>
              <div className="text-xs text-muted-foreground mb-4">{section.subtitle}</div>
              {section.items.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{section.empty}</div>
              ) : (() => {
                const top = section.items.slice(0, 6);
                const total = top.reduce((s, i) => s + i.count, 0);
                const maxVal = Math.max(...top.map(i => i.count));
                const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                const ringData = top.map((i, idx) => ({ label: i.name, value: i.count, maxValue: maxVal, color: chartColors[idx % 5] }));
                return (
                  <div className="flex flex-col items-center gap-5">
                    <RingChart data={ringData} size={220} strokeWidth={10} ringGap={4} baseInnerRadius={50}>
                      {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
                      <RingCenter defaultLabel="" valueClassName="text-2xl font-bold" labelClassName="text-[10px]" />
                    </RingChart>
                    <div className="w-full space-y-2.5">
                      {top.map((item, i) => {
                        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center gap-2 text-sm mb-1">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                              {section.icon(item.name, i)}
                              <span className={`truncate font-medium ${section.capitalize ? "capitalize" : ""}`}>{item.name}</span>
                              <span className="ml-auto text-muted-foreground tabular-nums text-xs">{item.count.toLocaleString()}</span>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full ml-5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: `var(--chart-${(i % 5) + 1})` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Top Countries + Top Pages Ring Charts */}
      {activeWebsiteId && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              title: "Top Countries",
              subtitle: "Visitors by country",
              items: (statsData?.topCountries ?? []).map(c => ({ name: c.country, count: c.visitors })),
              icon: (name: string) => <CountryFlag countryCode={name} size={16} />,
              empty: "No country data",
            },
            {
              title: "Top Pages",
              subtitle: "Most visited pages",
              items: topPages.map(p => ({ name: p.page, count: p.views })),
              icon: () => null,
              empty: "No page data",
              loading: loadingPages,
            },
          ].map((section) => (
            <div key={section.title} className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-sm font-medium text-foreground">{section.title}</div>
              <div className="text-xs text-muted-foreground mb-4">{section.subtitle}</div>
              {section.loading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : section.items.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{section.empty}</div>
              ) : (() => {
                const top = section.items.slice(0, 6);
                const total = top.reduce((s, i) => s + i.count, 0);
                const maxVal = Math.max(...top.map(i => i.count));
                const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                const ringData = top.map((i, idx) => ({ label: i.name, value: i.count, maxValue: maxVal, color: chartColors[idx % 5] }));
                return (
                  <div className="flex items-start gap-6">
                    <div className="shrink-0">
                      <RingChart data={ringData} size={200} strokeWidth={10} ringGap={4} baseInnerRadius={45}>
                        {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
                        <RingCenter defaultLabel="Total" valueClassName="text-xl font-bold" labelClassName="text-[10px]" />
                      </RingChart>
                    </div>
                    <div className="flex-1 space-y-2.5 min-w-0 pt-2">
                      {top.map((item, i) => {
                        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center gap-2 text-sm mb-1">
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: chartColors[i % 5] }} />
                              {section.icon(item.name)}
                              <span className="truncate font-medium">{item.name}</span>
                              <span className="ml-auto text-muted-foreground tabular-nums text-xs">{item.count.toLocaleString()}</span>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full ml-5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: chartColors[i % 5] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Top Referrers */}
      {activeWebsiteId && trafficData && (trafficData.referrers.length > 0 || trafficData.sources.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {trafficData.referrers.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-sm font-medium text-foreground">Top Referrers</div>
              <div className="text-xs text-muted-foreground mb-4">External sites sending traffic</div>
              {(() => {
                const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                const top = trafficData.referrers.slice(0, 6);
                const total = top.reduce((s, r) => s + r.visitors, 0);
                const maxVal = Math.max(...top.map(r => r.visitors));
                const ringData = top.map((r, idx) => ({ label: r.referrer, value: r.visitors, maxValue: maxVal, color: chartColors[idx % 5] }));
                return (
                  <div className="flex items-start gap-6">
                    <div className="shrink-0">
                      <RingChart data={ringData} size={200} strokeWidth={10} ringGap={4} baseInnerRadius={45}>
                        {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
                        <RingCenter defaultLabel="Total" valueClassName="text-xl font-bold" labelClassName="text-[10px]" />
                      </RingChart>
                    </div>
                    <div className="flex-1 space-y-2.5 min-w-0 pt-2">
                      {top.map((item, i) => {
                        const pct = total > 0 ? Math.round((item.visitors / total) * 100) : 0;
                        return (
                          <div key={item.referrer}>
                            <div className="flex items-center gap-2 text-sm mb-1">
                              <SourceIcon source={item.referrer} size={14} />
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: chartColors[i % 5] }} />
                              <span className="truncate font-medium">{item.referrer}</span>
                              <span className="ml-auto text-muted-foreground tabular-nums text-xs">{item.visitors.toLocaleString()}</span>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full ml-5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: chartColors[i % 5] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          {trafficData.sources.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-sm font-medium text-foreground">Traffic Sources</div>
              <div className="text-xs text-muted-foreground mb-4">UTM source breakdown</div>
              {(() => {
                const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                const top = trafficData.sources.slice(0, 6);
                const total = top.reduce((s, r) => s + r.visitors, 0);
                const maxVal = Math.max(...top.map(r => r.visitors));
                const ringData = top.map((r, idx) => ({ label: r.source, value: r.visitors, maxValue: maxVal, color: chartColors[idx % 5] }));
                return (
                  <div className="flex items-start gap-6">
                    <div className="shrink-0">
                      <RingChart data={ringData} size={200} strokeWidth={10} ringGap={4} baseInnerRadius={45}>
                        {ringData.map((_, i) => <Ring key={ringData[i]?.label ?? i} index={i} />)}
                        <RingCenter defaultLabel="Total" valueClassName="text-xl font-bold" labelClassName="text-[10px]" />
                      </RingChart>
                    </div>
                    <div className="flex-1 space-y-2.5 min-w-0 pt-2">
                      {top.map((item, i) => {
                        const pct = total > 0 ? Math.round((item.visitors / total) * 100) : 0;
                        return (
                          <div key={item.source}>
                            <div className="flex items-center gap-2 text-sm mb-1">
                              <SourceIcon source={item.source} size={14} />
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: chartColors[i % 5] }} />
                              <span className="truncate font-medium">{item.source}</span>
                              <span className="ml-auto text-muted-foreground tabular-nums text-xs">{item.visitors.toLocaleString()}</span>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full ml-5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: chartColors[i % 5] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Bounce & Duration */}
      {activeWebsiteId && (
        <div className="rounded-lg border border-border/60 bg-background/60 p-4">
          <div className="text-sm font-medium text-foreground">Bounce Rate &amp; Session Duration</div>
          <div className="text-xs text-muted-foreground mb-2">User engagement metrics over time</div>
          {chartData.length > 0 ? (
              <VisxAreaChart data={chartData} aspectRatio="3 / 1">
                <VisxGrid horizontal numTicksRows={4} />
                <VisxArea dataKey="bounceRate" fill="var(--chart-3)" fillOpacity={0.3} strokeWidth={2} />
                <VisxArea dataKey="avgSessionDuration" fill="var(--chart-4)" fillOpacity={0.3} strokeWidth={2} />
                <VisxXAxis />
                <VisxChartTooltip
                  rows={(point) => [
                    { color: "var(--chart-3)", label: "Bounce Rate", value: `${(point.bounceRate as number)?.toFixed(1) ?? "0"}%` },
                    { color: "var(--chart-4)", label: "Avg Session", value: `${Math.floor((point.avgSessionDuration as number ?? 0) / 60)}m ${Math.round((point.avgSessionDuration as number ?? 0) % 60)}s` },
                  ]}
                />
              </VisxAreaChart>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground">
              No data available for the selected period
            </div>
          )}
        </div>
      )}

      {/* No Data Message */}
      {activeWebsiteId && !loadingAnalytics && analyticsData.length === 0 && (
        <div className="rounded-lg border border-border/60 bg-background/60 p-6">
          <div className="text-center space-y-2">
            <IconEye size={48} className="text-gray-400 mx-auto" />
            <h3 className="text-lg font-medium text-foreground">
              No analytics data available
            </h3>
            <p className="text-muted-foreground">
              Start tracking your website to see analytics data here.
            </p>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function FunnelsTab({ websiteId }: { websiteId: string }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");
  const [newFunnelSteps, setNewFunnelSteps] = useState<Array<{ name: string; type: "pageview" | "event"; targetValue: string; targetMatch: "exact" | "contains" | "regex" }>>([
    { name: "Step 1", type: "pageview", targetValue: "/", targetMatch: "exact" },
  ]);

  const utils = trpc.useUtils();
  const { data: funnelsList = [], isLoading } = trpc.funnels.list.useQuery({ websiteId });
  const { data: suggestions } = trpc.funnels.suggestions.useQuery({ websiteId });

  const createFunnel = trpc.funnels.create.useMutation({
    onSuccess() {
      utils.funnels.list.invalidate();
      setShowCreate(false);
      setNewFunnelName("");
      setNewFunnelSteps([{ name: "Step 1", type: "pageview", targetValue: "/", targetMatch: "exact" }]);
    },
  });

  const deleteFunnel = trpc.funnels.delete.useMutation({
    onSuccess() {
      utils.funnels.list.invalidate();
    },
  });

  const [selectedFunnel, setSelectedFunnel] = useState<string | null>(null);
  const { data: analysis } = trpc.funnels.analyze.useQuery(
    { id: selectedFunnel! },
    { enabled: !!selectedFunnel }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Track user journeys through multi-step conversion paths
        </p>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "Create Funnel"}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="funnel-name">Funnel Name</Label>
            <Input
              id="funnel-name"
              value={newFunnelName}
              onChange={(e) => setNewFunnelName(e.target.value)}
              placeholder="e.g., Signup Flow"
            />
          </div>
          <div className="space-y-2">
            <Label>Steps</Label>
            {newFunnelSteps.map((step, i) => (
              <div key={`step-${i}`} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                <Input
                  value={step.name}
                  onChange={(e) => {
                    const s = [...newFunnelSteps];
                    s[i] = { ...s[i], name: e.target.value };
                    setNewFunnelSteps(s);
                  }}
                  placeholder="Step name"
                  className="w-32"
                />
                <Select
                  value={step.type}
                  onValueChange={(v) => {
                    const s = [...newFunnelSteps];
                    s[i] = { ...s[i], type: v as "pageview" | "event" };
                    setNewFunnelSteps(s);
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pageview">Page View</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={step.targetValue}
                  onValueChange={(v) => {
                    const s = [...newFunnelSteps];
                    s[i] = { ...s[i], targetValue: v };
                    setNewFunnelSteps(s);
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={step.type === "pageview" ? "Select page" : "Select event"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(step.type === "pageview" ? suggestions?.pages : suggestions?.eventNames)?.map((val) => (
                      <SelectItem key={val} value={val}>{val}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newFunnelSteps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewFunnelSteps(newFunnelSteps.filter((_, j) => j !== i))}
                  >
                    &times;
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewFunnelSteps([...newFunnelSteps, { name: `Step ${newFunnelSteps.length + 1}`, type: "pageview" as const, targetValue: "", targetMatch: "exact" as const }])}
            >
              + Add Step
            </Button>
          </div>
          <Button
            size="sm"
            disabled={!newFunnelName.trim() || newFunnelSteps.some((s) => !s.targetValue.trim()) || createFunnel.isPending}
            onClick={() => createFunnel.mutate({ websiteId, name: newFunnelName, steps: newFunnelSteps })}
          >
            Create
          </Button>
        </div>
      )}

      {/* Funnel list */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : funnelsList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">No funnels yet. Create one to start tracking user journeys.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funnelsList.map((funnel) => (
            <div
              key={funnel.id}
              className={`rounded-lg border p-4 cursor-pointer transition-colors ${selectedFunnel === funnel.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedFunnel(selectedFunnel === funnel.id ? null : funnel.id)}
              onKeyDown={(e) => { if (e.key === "Enter") setSelectedFunnel(selectedFunnel === funnel.id ? null : funnel.id); }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{funnel.name}</h3>
                  <p className="text-xs text-muted-foreground">{funnel.stepCount} steps</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); deleteFunnel.mutate({ id: funnel.id }); }}
                  className="text-red-500 hover:text-red-600"
                >
                  Delete
                </Button>
              </div>

              {/* Funnel analysis visualization */}
              {selectedFunnel === funnel.id && analysis && (
                <div className="mt-4 space-y-2">
                  {analysis.map((step, i) => {
                    const maxCount = analysis[0]?.count ?? 1;
                    const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                    return (
                      <div key={step.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">{step.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums">{step.count.toLocaleString()}</span>
                            {i > 0 && (
                              <span className={`text-xs tabular-nums ${step.dropoff > 50 ? "text-red-500" : step.dropoff > 20 ? "text-amber-500" : "text-green-500"}`}>
                                {step.dropoff > 0 ? `-${step.dropoff.toFixed(1)}%` : "0%"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: `oklch(0.7 0.15 ${140 - (i * 30)})`,
                            }}
                          />
                        </div>
                        {i > 0 && (step.avgTimeFromPrevious ?? 0) > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            avg {Math.round((step.avgTimeFromPrevious ?? 0) / 1000)}s from previous
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsPage() {
  return <AnalyticsContent />;
}
