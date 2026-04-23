import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconChartBar,
  IconTrendingUp,
  IconGlobe,
  IconDeviceLaptop,
  IconTarget,
  IconUsers,
  IconDownload,
} from "@tabler/icons-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { sileo } from "sileo";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceIcon } from "@/components/ui/device-icon";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

interface Website {
  id: string;
  name: string;
  url: string;
}

interface ReportData {
  executive?: {
    totalVisitors: number;
    totalPageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
    trends: {
      visitorsChange: number;
      pageViewsChange: number;
      sessionChange: number;
      bounceChange: number;
    };
    topPerformers: Array<{ name: string; metric: string; value: number }>;
  };
  traffic?: {
    sources: Array<{ source: string; visitors: number; percentage: number }>;
    campaigns: Array<{
      campaign: string;
      source: string;
      visitors: number;
    }>;
    referrers: Array<{ referrer: string; visitors: number }>;
    geography: Array<{ country: string; visitors: number }>;
  };
  behavior?: {
    topPages: Array<{ page: string; views: number; avgTime: number }>;
    exitPages: Array<{ page: string; exits: number; percentage: number }>;
    timeDistribution: Array<{ range: string; visitors: number }>;
  };
  technology?: {
    browsers: Array<{ name: string; value: number }>;
    os: Array<{ name: string; value: number }>;
    devices: Array<{ name: string; value: number }>;
    screenResolutions: Array<{ resolution: string; count: number }>;
  };
}

function ReportsPage() {
  const [selectedWebsite, setSelectedWebsite] = useState<string>("");
  const [dateRange, setDateRange] = useState("30");
  const [activeReport, setActiveReport] = useState("executive");

  const { data: websitesData, isLoading: loadingWebsites } = trpc.websites.optimized.useQuery();
  const websites: Website[] = useMemo(() => {
    const items = Array.isArray(websitesData?.items) ? websitesData?.items : [];
    return items.map((w) => ({
      id: String(w.id ?? ""),
      name: String(w.name ?? ""),
      url: String(w.url ?? ""),
    }));
  }, [websitesData]);

  useEffect(() => {
    if (!loadingWebsites && websites.length > 0 && !selectedWebsite) {
      setSelectedWebsite(websites[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websites.length, loadingWebsites]);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - parseInt(dateRange));

  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  const { data: analyticsData, isLoading: loadingAnalytics } = trpc.analytics.overview.useQuery(
    {
      websiteId: selectedWebsite,
      startDate: startDateStr,
      endDate: endDateStr,
    },
    { enabled: !!selectedWebsite }
  );

  const { data: devicesData, isLoading: loadingDevices } = trpc.analytics.devices.useQuery(
    {
      websiteId: selectedWebsite,
      startDate: startDateStr,
      endDate: endDateStr,
    },
    { enabled: !!selectedWebsite }
  );

  const { data: pagesData, isLoading: loadingPages } = trpc.analytics.pages.useQuery(
    {
      websiteId: selectedWebsite,
      startDate: startDateStr,
      endDate: endDateStr,
      limit: 10,
    },
    { enabled: !!selectedWebsite }
  );

  const { data: trafficData, isLoading: loadingTraffic } = trpc.analytics.traffic.useQuery(
    {
      websiteId: selectedWebsite,
      startDate: startDateStr,
      endDate: endDateStr,
    },
    { enabled: !!selectedWebsite }
  );

  const loading = loadingAnalytics || loadingDevices || loadingPages || loadingTraffic;

  const reportData: ReportData = useMemo(() => {
    const summary = analyticsData?.summary || {
      totalUniqueVisitors: 0,
      totalPageViews: 0,
      avgSessionDuration: 0,
      avgBounceRate: 0,
      trend: {
        uniqueVisitors: 0,
        pageViews: 0,
        sessionDuration: 0,
        bounceRate: 0,
      },
    };

    return {
      executive: {
        totalVisitors: summary.totalUniqueVisitors || 0,
        totalPageViews: summary.totalPageViews || 0,
        avgSessionDuration: summary.avgSessionDuration || 0,
        bounceRate: summary.avgBounceRate || 0,
        trends: {
          visitorsChange: summary.trend?.uniqueVisitors || 0,
          pageViewsChange: summary.trend?.pageViews || 0,
          sessionChange: summary.trend?.sessionDuration || 0,
          bounceChange: summary.trend?.bounceRate || 0,
        },
        topPerformers: Array.isArray(pagesData) && pagesData.length > 0
          ? pagesData.slice(0, 5).map((page: { page: string; views: number }) => ({
              name: page.page,
              metric: "Views",
              value: page.views,
            }))
          : [],
      },
      technology: {
        browsers: [],
        os: [],
        devices: Array.isArray(devicesData) && devicesData.length > 0
          ? devicesData.map((d: { name: string; value: number }) => ({
              name: d.name,
              value: d.value,
            }))
          : [],
        screenResolutions: [],
      },
      behavior: {
        topPages: Array.isArray(pagesData) && pagesData.length > 0
          ? pagesData.map((page: { page: string; views: number }) => ({
              page: page.page,
              views: page.views,
              avgTime: 0,
            }))
          : [],
        exitPages: [],
        timeDistribution: [],
      },
      traffic: {
        sources: trafficData?.sources || [],
        campaigns: trafficData?.campaigns || [],
        referrers: trafficData?.referrers || [],
        geography: [],
      },
    };
  }, [analyticsData, devicesData, pagesData, trafficData]);

  const exportReport = (format: string) => {
    sileo.info({ title: `Exporting report as ${format.toUpperCase()}...` });
  };

  const getTrendColor = (value: number) => {
    if (value > 0) return "text-green-600";
    if (value < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return "↑";
    if (value < 0) return "↓";
    return "→";
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading && websites.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-10 w-[250px]" />
            <Skeleton className="h-10 w-[150px]" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36 mb-1" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <Select value={selectedWebsite} onValueChange={setSelectedWebsite}>
            <SelectTrigger className="w-[180px]">
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

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => exportReport("pdf")}>
            <IconDownload size={16} className="mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Report Tabs */}
      <Tabs
        value={activeReport}
        onValueChange={setActiveReport}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-5 lg:w-auto">
          <TabsTrigger value="executive" className="flex items-center gap-2">
            <IconChartBar size={16} />
            <span className="hidden sm:inline">Executive</span>
          </TabsTrigger>
          <TabsTrigger value="traffic" className="flex items-center gap-2">
            <IconTrendingUp size={16} />
            <span className="hidden sm:inline">Traffic</span>
          </TabsTrigger>
          <TabsTrigger value="behavior" className="flex items-center gap-2">
            <IconUsers size={16} />
            <span className="hidden sm:inline">Behavior</span>
          </TabsTrigger>
          <TabsTrigger value="technology" className="flex items-center gap-2">
            <IconDeviceLaptop size={16} />
            <span className="hidden sm:inline">Technology</span>
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-2">
            <IconTarget size={16} />
            <span className="hidden sm:inline">Goals</span>
          </TabsTrigger>
        </TabsList>

        {/* Executive Summary */}
        <TabsContent value="executive" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Visitors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.executive?.totalVisitors.toLocaleString() || 0}
                </div>
                <div className="flex items-center text-sm mt-1">
                  <span className={getTrendColor(reportData.executive?.trends.visitorsChange || 0)}>
                    {getTrendIcon(reportData.executive?.trends.visitorsChange || 0)}
                    {Math.abs(reportData.executive?.trends.visitorsChange || 0).toFixed(1)}%
                  </span>
                  <span className="text-gray-500 ml-2">vs previous period</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Page Views
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.executive?.totalPageViews.toLocaleString() || 0}
                </div>
                <div className="flex items-center text-sm mt-1">
                  <span className={getTrendColor(reportData.executive?.trends.pageViewsChange || 0)}>
                    {getTrendIcon(reportData.executive?.trends.pageViewsChange || 0)}
                    {Math.abs(reportData.executive?.trends.pageViewsChange || 0).toFixed(1)}%
                  </span>
                  <span className="text-gray-500 ml-2">vs previous period</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg. Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(reportData.executive?.avgSessionDuration || 0)}
                </div>
                <div className="flex items-center text-sm mt-1">
                  <span className={getTrendColor(reportData.executive?.trends.sessionChange || 0)}>
                    {getTrendIcon(reportData.executive?.trends.sessionChange || 0)}
                    {Math.abs(reportData.executive?.trends.sessionChange || 0).toFixed(1)}%
                  </span>
                  <span className="text-gray-500 ml-2">vs previous period</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bounce Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.executive?.bounceRate.toFixed(1) || 0}%
                </div>
                <div className="flex items-center text-sm mt-1">
                  <span className={getTrendColor(-(reportData.executive?.trends.bounceChange || 0))}>
                    {getTrendIcon(-(reportData.executive?.trends.bounceChange || 0))}
                    {Math.abs(reportData.executive?.trends.bounceChange || 0).toFixed(1)}%
                  </span>
                  <span className="text-gray-500 ml-2">vs previous period</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Performers</CardTitle>
              <CardDescription>Pages with highest traffic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.executive?.topPerformers.map((page, index) => (
                  <div key={page.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-sm font-medium text-blue-600">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{page.name}</p>
                        <p className="text-sm text-gray-500">{page.metric}</p>
                      </div>
                    </div>
                    <span className="text-lg font-semibold">
                      {page.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Traffic Report */}
        <TabsContent value="traffic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
              <CardDescription>Where your visitors come from</CardDescription>
            </CardHeader>
            <CardContent>
              {reportData?.traffic?.sources && reportData.traffic.sources.length > 0 ? (
                <div className="space-y-4">
                  {reportData.traffic.sources.map((source) => (
                    <div key={source.source} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <IconGlobe size={16} className="text-gray-400" />
                        <span className="font-medium capitalize">{source.source}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {source.visitors} visitors
                        </span>
                        <span className="text-sm font-medium text-blue-600">
                          {source.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <IconGlobe size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No traffic source data available</p>
                  <p className="text-sm mt-2">Data will appear as visitors start arriving</p>
                </div>
              )}
            </CardContent>
          </Card>

          {reportData?.traffic?.campaigns && reportData.traffic.campaigns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Campaigns</CardTitle>
                <CardDescription>UTM campaign performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.traffic.campaigns.map((campaign) => (
                    <div key={campaign.campaign} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{campaign.campaign}</div>
                        <div className="text-sm text-gray-500">{campaign.source}</div>
                      </div>
                      <div className="text-sm font-medium">
                        {campaign.visitors} visitors
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {reportData?.traffic?.referrers && reportData.traffic.referrers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Referrers</CardTitle>
                <CardDescription>Websites sending you traffic</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.traffic.referrers.map((ref) => (
                    <div key={ref.referrer} className="flex items-center justify-between">
                      <span className="font-medium truncate flex-1">{ref.referrer}</span>
                      <span className="text-sm text-muted-foreground ml-4">
                        {ref.visitors} visitors
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Behavior Report */}
        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
              <CardDescription>Most visited pages on your website</CardDescription>
            </CardHeader>
            <CardContent>
              {reportData.behavior?.topPages && reportData.behavior.topPages.length > 0 ? (
                <div className="space-y-4">
                  {reportData.behavior.topPages.map((page) => (
                    <div key={page.page} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex-1">
                        <p className="font-medium">{page.page}</p>
                      </div>
                      <span className="text-sm font-semibold">
                        {page.views.toLocaleString()} views
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No page data available</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technology Report */}
        <TabsContent value="technology" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Device Breakdown</CardTitle>
              <CardDescription>Visitors by device type</CardDescription>
            </CardHeader>
            <CardContent>
              {reportData.technology?.devices && reportData.technology.devices.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.technology.devices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {reportData.technology.devices.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No device data available</div>
              )}
              {reportData.technology?.devices && reportData.technology.devices.length > 0 && (
                <div className="mt-4 space-y-2">
                  {reportData.technology.devices.map((device) => (
                    <div key={device.name} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <DeviceIcon device={device.name} size={16} />
                        <span className="font-medium capitalize">{device.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {device.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversions Report */}
        <TabsContent value="conversions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Goals & Conversions</CardTitle>
              <CardDescription>Track your conversion goals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <IconTarget size={48} className="mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">No Goals Set Up Yet</h3>
                <p className="text-gray-500 mb-4">
                  Create goals to track conversions and measure success
                </p>
                <Button>Create Your First Goal</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
