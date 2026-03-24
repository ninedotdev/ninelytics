"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconArrowLeft, IconDownload, IconRefresh } from "@tabler/icons-react";
import { sileo } from "sileo";
import { api } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  generateCSV,
  generateJSON,
  generateExcelCSV,
  formatAnalyticsForExport,
} from "@/lib/export-helpers";

interface CustomReport {
  id: string;
  websiteId: string;
  name: string;
  description?: string | null;
  metrics: string[];
  filters?: Record<string, string> | null;
  schedule?: string | null;
  isActive: boolean;
  isPublic: boolean;
  website: {
    id: string;
    name: string;
    url: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface ReportData {
  report: CustomReport;
  dateRange: {
    start: string;
    end: string;
  };
  data: {
    data: Array<{
      date: string;
      pageViews: number;
      uniqueVisitors: number;
      bounceRate: number;
      avgSessionDuration: number;
    }>;
    summary: Record<string, unknown>;
  };
}

export default function ViewCustomReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [report, setReport] = useState<CustomReport | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dateRange, setDateRange] = useState("30");
  const [loading, setLoading] = useState(true);

  const { data: reportData_query, isLoading: loadingReport, error: reportError } = api.customReports.byId.useQuery(
    { id: resolvedParams.id }
  );

  useEffect(() => {
    if (reportError) {
      sileo.error({ title: "Failed to load report" });
      router.push("/custom-reports");
    }
  }, [reportError, router]);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - parseInt(dateRange));

  const { data: executeData, isLoading: loadingExecute, refetch: refetchExecute } = api.customReports.execute.useQuery(
    {
      id: resolvedParams.id,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
    {
      enabled: !!reportData_query,
    }
  );

  useEffect(() => {
    if (reportData_query) {
      setReport(reportData_query as CustomReport);
    }
  }, [reportData_query]);

  // Fetch analytics data when executeData is available
  const websiteId = reportData_query?.websiteId;
  const { data: analyticsOverview, isLoading: loadingAnalytics } = api.analytics.overview.useQuery(
    {
      websiteId: websiteId || "",
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
    {
      enabled: !!executeData && !!websiteId,
    }
  );

  useEffect(() => {
    if (executeData && analyticsOverview && report) {
      setReportData({
        report: report,
        dateRange: executeData.dateRange,
        data: {
          data: analyticsOverview.data || [],
          summary: analyticsOverview.summary || {},
        },
      });
    }
    setLoading(loadingReport || loadingExecute || loadingAnalytics);
  }, [executeData, analyticsOverview, loadingReport, loadingExecute, loadingAnalytics, report]);

  const executeReport = () => {
    refetchExecute();
  };

  const handleExport = (format: "csv" | "excel" | "json") => {
    if (!reportData || !report) return;

    const data = reportData.data as Record<string, unknown>;
    const analyticsDataForExport = data.data as Array<{
      date: string;
      pageViews: number;
      uniqueVisitors: number;
      bounceRate: number;
      avgSessionDuration: number;
    }>;

    if (!analyticsDataForExport || analyticsDataForExport.length === 0) {
      sileo.error({ title: "No data to export" });
      return;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(dateRange));

    const exportData = formatAnalyticsForExport(
      analyticsDataForExport,
      report.name || "Custom Report",
      {
        start: startDate.toISOString().split("T")[0],
        end: endDate.toISOString().split("T")[0],
      }
    );

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

  if (!report) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded" />
              <div className="space-y-2">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-[140px]" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40 mb-1" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[300px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  const reportInfo = report as {
    name: string;
    description?: string;
    website: { name: string };
    metrics: string[];
  };

  const data = reportData?.data as Record<string, unknown> | undefined;
  const analyticsDataArray = data?.data as
    | Array<Record<string, unknown>>
    | undefined;
  const summary = data?.summary as Record<string, number> | undefined;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <IconArrowLeft size={16} />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{reportInfo.name}</h1>
              <p className="text-muted-foreground mt-1">
                {reportInfo.website.name}
                {reportInfo.description && ` • ${reportInfo.description}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={executeReport}
              disabled={loading}
            >
              <IconRefresh
                size={16}
                className={`mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            {reportData && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <IconDownload size={16} className="mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("csv")}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")}>
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("json")}>
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-40 mb-1" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[300px] w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : reportData ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            {summary && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {reportInfo.metrics.includes("pageViews") && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Page Views
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {summary.totalPageViews?.toLocaleString() || 0}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {reportInfo.metrics.includes("uniqueVisitors") && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Unique Visitors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {summary.totalUniqueVisitors?.toLocaleString() || 0}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {reportInfo.metrics.includes("bounceRate") && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Bounce Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {summary.avgBounceRate?.toFixed(1) || 0}%
                      </div>
                    </CardContent>
                  </Card>
                )}
                {reportInfo.metrics.includes("avgSessionDuration") && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Avg Session
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {Math.round(summary.avgSessionDuration || 0)}s
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Charts */}
            {analyticsDataArray && analyticsDataArray.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Page Views Trend */}
                {reportInfo.metrics.includes("pageViews") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Page Views Trend</CardTitle>
                      <CardDescription>
                        Daily page views over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analyticsDataArray}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value: string) =>
                              new Date(value).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            }
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="pageViews"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            name="Page Views"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Unique Visitors Trend */}
                {reportInfo.metrics.includes("uniqueVisitors") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Unique Visitors Trend</CardTitle>
                      <CardDescription>Daily unique visitors</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={analyticsDataArray}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value: string) =>
                              new Date(value).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            }
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="uniqueVisitors"
                            stroke="#10B981"
                            strokeWidth={2}
                            name="Unique Visitors"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No data available for the selected period
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
