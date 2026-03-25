"use client";

import React, { useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  IconGlobe,
  IconTrendingUp,
  IconUsers,
  IconEye,
  IconClock,
  IconSettings,
  IconChartBar,
  IconTrash,
  IconActivity,
  IconMapPin,
  IconLink,
  IconDots,
  IconChartAreaLine,
  IconCurrencyDollar,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WebsiteDeletionProgress } from "@/components/website-deletion-progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { sileo } from "sileo";
import Link from "next/link";
import { AreaChart as VisxAreaChart, Area as VisxArea } from "@/components/charts/area-chart";
import { Grid as VisxGrid } from "@/components/charts/grid";
import { XAxis as VisxXAxis } from "@/components/charts/x-axis";
import { ChartTooltip as VisxChartTooltip } from "@/components/charts/tooltip";
import { generatePredictions } from "@/components/charts/prediction-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { CountryFlag } from "@/components/ui/country-flag";
import { DeviceIcon } from "@/components/ui/device-icon";
import { OsIcon } from "@/components/ui/os-icon";
import { RingChart } from "@/components/charts/ring-chart";
import { Ring } from "@/components/charts/ring";
import { RingCenter } from "@/components/charts/ring-center";
import { api } from "@/utils/trpc";
import { useTimezone } from "@/hooks/use-timezone";
import { IconHeartRateMonitor } from "@tabler/icons-react";
import { SourceIcon } from "@/components/ui/source-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function WebsiteDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const websiteId = params.id as string;

  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const { timezone } = useTimezone();

  const { data, isLoading: loading } = api.websites.stats.useQuery(
    { id: websiteId, timezone, period: "1d" },
    { staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );

  const { data: stripeRevenue } = api.stripe.revenue.useQuery(
    { websiteId, days: 90 },
    { enabled: !!data },
  );

  const { data: uptimeStatus } = api.uptime.getStatus.useQuery(
    { websiteId },
    { enabled: !!data, refetchInterval: 60000 },
  );

  const { data: uptimeIncidents } = api.uptime.getIncidents.useQuery(
    { websiteId, limit: 5 },
    { enabled: !!uptimeStatus },
  );

  // Must be before early returns (Rules of Hooks)
  const forecastChartData = useMemo(() => {
    const last28Days = data?.stats?.last28Days
    if (!last28Days || last28Days.length < 7) return []
    const historical = last28Days.slice(-14)
    const predictedViews = generatePredictions(last28Days, "views", 7)
    const predictedVisitors = generatePredictions(last28Days, "visitors", 7)
    return [
      ...historical.map((d, i) => ({
        date: new Date(d.date + "T00:00:00Z"),
        views: d.views,
        visitors: d.visitors,
        predictedViews: i === historical.length - 1 ? d.views : 0,
        predictedVisitors: i === historical.length - 1 ? d.visitors : 0,
      })),
      ...predictedViews.map((p, i) => ({
        date: new Date(p.date + "T00:00:00Z"),
        views: 0,
        visitors: 0,
        predictedViews: p.value,
        predictedVisitors: predictedVisitors[i]?.value ?? 0,
      })),
    ]
  }, [data?.stats?.last28Days])

  const handleDelete = async () => {
    setShowDeletionDialog(true);
  };

  const handleDeletionComplete = () => {
    sileo.success({ title: "Website deleted successfully" });
    router.push("/websites");
  };

  const handleDeletionCancel = () => {
    setShowDeletionDialog(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "INACTIVE":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return formatDate(dateString);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-[150px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <IconGlobe size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Website not found
          </h3>
          <Button asChild>
            <Link href="/websites">Back to Websites</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { website, stats } = data;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className={getStatusColor(website.status)}>
              {website.status.toLowerCase()}
            </Badge>
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <IconGlobe size={14} />
              <a
                href={website.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {website.url}
              </a>
            </span>
            {uptimeStatus && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${
                  uptimeStatus.status === "up" ? "bg-green-500" :
                  uptimeStatus.status === "down" ? "bg-red-500" :
                  uptimeStatus.status === "degraded" ? "bg-yellow-500" :
                  "bg-muted"
                }`} />
                <span className="capitalize font-medium">{uptimeStatus.status === "up" ? "Online" : uptimeStatus.status}</span>
                {uptimeStatus.responseTime && <span>{uptimeStatus.responseTime}ms</span>}
                {uptimeStatus.uptimePercent != null && <span>{uptimeStatus.uptimePercent}% uptime</span>}
              </div>
            )}
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center space-x-2">
            <Button variant="outline" asChild>
              <Link href={`/analytics?website=${website.id}`}>
                <IconChartBar size={16} className="mr-2" />
                Detailed Analytics
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/websites/${website.id}/settings`}>
                <IconSettings size={16} className="mr-2" />
                Settings
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <IconTrash size={16} className="mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    the website and all associated analytics data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    variant="destructive"
                  >
                    Delete Website
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Mobile actions */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <IconDots size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/analytics?website=${website.id}`}>
                    <IconChartBar size={16} className="mr-2" />
                    Detailed Analytics
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/websites/${website.id}/settings`}>
                    <IconSettings size={16} className="mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-red-600 dark:text-red-400"
                >
                  <IconTrash size={16} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitors Today</CardTitle>
              <IconUsers size={16} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.periodStats.visitors.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Unique visitors today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Page Views Today</CardTitle>
              <IconEye size={16} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.periodStats.pageViews.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total views today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
              <IconTrendingUp size={16} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.periodStats.bounceRate}%
              </div>
              <p className="text-xs text-muted-foreground">Today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg. Session
              </CardTitle>
              <IconClock size={16} className="text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDuration(stats.periodStats.avgSessionDuration)}
              </div>
              <p className="text-xs text-muted-foreground">Average duration today</p>
            </CardContent>
          </Card>
        </div>

        {/* Traffic trend + Revenue (side by side when revenue exists) */}
        {forecastChartData.length > 0 && (
          <div className={`grid gap-6 ${stripeRevenue && stripeRevenue.data.length > 0 ? "lg:grid-cols-2" : ""}`}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconChartAreaLine size={16} />
                  7-Day Forecast
                </CardTitle>
                <CardDescription>Last 14 days · lighter area shows predicted next 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <VisxAreaChart data={forecastChartData} aspectRatio="3 / 1">
                  <VisxGrid horizontal numTicksRows={4} />
                  <VisxArea dataKey="views" fill="var(--chart-1)" fillOpacity={0.4} strokeWidth={2} />
                  <VisxArea dataKey="predictedViews" fill="var(--chart-1)" fillOpacity={0.15} strokeWidth={1.5} />
                  <VisxArea dataKey="visitors" fill="var(--chart-2)" fillOpacity={0.4} strokeWidth={2} />
                  <VisxArea dataKey="predictedVisitors" fill="var(--chart-2)" fillOpacity={0.15} strokeWidth={1.5} />
                  <VisxXAxis />
                  <VisxChartTooltip
                    rows={(point) => {
                      const isHistorical = (point.views as number) > 0 || (point.visitors as number) > 0
                      return [
                        { color: "var(--chart-1)", label: isHistorical ? "Views" : "Predicted Views", value: isHistorical ? (point.views as number).toLocaleString() : (point.predictedViews as number).toLocaleString() },
                        { color: "var(--chart-2)", label: isHistorical ? "Visitors" : "Predicted Visitors", value: isHistorical ? (point.visitors as number).toLocaleString() : (point.predictedVisitors as number).toLocaleString() },
                      ]
                    }}
                  />
                </VisxAreaChart>
              </CardContent>
            </Card>

            {stripeRevenue && stripeRevenue.data.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <IconCurrencyDollar size={16} />
                        Revenue
                      </CardTitle>
                      <CardDescription>Last 90 days from Stripe</CardDescription>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <div className="text-2xl font-bold">
                          ${stripeRevenue.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-muted-foreground">{stripeRevenue.totalCharges} charges</p>
                      </div>
                      {stripeRevenue.data.some((d) => d.newCustomers > 0) && (
                        <div>
                          <div className="text-2xl font-bold">
                            {stripeRevenue.data.reduce((sum, d) => sum + d.newCustomers, 0)}
                          </div>
                          <p className="text-xs text-muted-foreground">new customers</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <RevenueChart data={stripeRevenue.data} currency={stripeRevenue.currency} />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Ring Chart Breakdowns */}
        {(() => {
          const chartColors = [
            "var(--chart-1)",
            "var(--chart-2)",
            "var(--chart-3)",
            "var(--chart-4)",
            "var(--chart-5)",
          ];
          const ringSection = (
            title: string,
            subtitle: string,
            items: { name: string; count: number }[],
            icon: (name: string) => React.ReactNode,
            empty: string,
            options?: { capitalize?: boolean; horizontal?: boolean },
          ) => {
            if (items.length === 0)
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {empty}
                    </p>
                  </CardContent>
                </Card>
              );
            const top = items.slice(0, 6);
            const total = top.reduce((s, i) => s + i.count, 0);
            const maxVal = Math.max(...top.map((i) => i.count));
            const ringData = top.map((i, idx) => ({
              label: i.name,
              value: i.count,
              maxValue: maxVal,
              color: chartColors[idx % 5],
            }));
            return (
              <Card>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={
                      options?.horizontal
                        ? "flex items-start gap-6"
                        : "flex flex-col items-center gap-5"
                    }
                  >
                    <div className="shrink-0">
                      <RingChart
                        data={ringData}
                        size={200}
                        strokeWidth={10}
                        ringGap={4}
                        baseInnerRadius={45}
                      >
                        {ringData.map((_, i) => (
                          <Ring key={ringData[i]?.label ?? i} index={i} />
                        ))}
                        <RingCenter
                          defaultLabel=""
                          valueClassName="text-xl font-bold"
                          labelClassName="text-[10px]"
                        />
                      </RingChart>
                    </div>
                    <div
                      className={`${options?.horizontal ? "flex-1" : "w-full"} space-y-2.5 min-w-0`}
                    >
                      {top.map((item, i) => {
                        const pct =
                          total > 0
                            ? Math.round((item.count / total) * 100)
                            : 0;
                        return (
                          <div key={item.name}>
                            <div className="flex items-center gap-2 text-sm mb-1">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ background: chartColors[i % 5] }}
                              />
                              {icon(item.name)}
                              <span
                                className={`truncate font-medium ${options?.capitalize ? "capitalize" : ""}`}
                              >
                                {item.name}
                              </span>
                              <span className="ml-auto text-muted-foreground tabular-nums text-xs">
                                {item.count.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">
                                {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full ml-5">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: chartColors[i % 5],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          };

          return (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                {ringSection(
                  "Top Pages",
                  "Most visited pages",
                  stats.topPages.map((p) => ({ name: p.page, count: p.views })),
                  () => null,
                  "No page views yet",
                  { horizontal: true },
                )}
                {ringSection(
                  "Top Countries",
                  "Visitors by country",
                  stats.topCountries.map((c) => ({
                    name: c.country,
                    count: c.visitors,
                  })),
                  (name) => (
                    <CountryFlag countryCode={name} size={16} />
                  ),
                  "No visitor data yet",
                  { horizontal: true },
                )}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {ringSection(
                  "Devices",
                  "Visitors by device type",
                  stats.deviceBreakdown.map((d) => ({
                    name: d.device,
                    count: d.count,
                  })),
                  (name) => (
                    <DeviceIcon device={name} size={14} className="shrink-0" />
                  ),
                  "No device data yet",
                  { capitalize: true, horizontal: true },
                )}
                {ringSection(
                  "Operating Systems",
                  "Visitors by OS",
                  (
                    (stats.osBreakdown as Array<{
                      os: string;
                      count: number;
                    }>) ?? []
                  ).map((o) => ({ name: o.os, count: o.count })),
                  (name) => (
                    <OsIcon os={name} size={14} className="shrink-0" />
                  ),
                  "No OS data yet",
                  { horizontal: true },
                )}
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {ringSection(
                  "Top Cities",
                  "Visitors by city",
                  stats.topCities.map((c) => ({
                    name: `${c.city}, ${c.country}`,
                    count: c.visitors,
                  })),
                  () => null,
                  "No city data yet",
                  { horizontal: true },
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Referral Sources</CardTitle>
                    <CardDescription>
                      Traffic sources (today)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stats.topReferrers.length > 0 ||
                    stats.topSources.length > 0 ? (
                      <div className="space-y-4">
                        {stats.topReferrers.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                              Referrers
                            </h4>
                            <div className="space-y-2">
                              {stats.topReferrers.slice(0, 5).map((r, i) => (
                                <div
                                  key={r.referrer}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <div
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ background: chartColors[i % 5] }}
                                  />
                                  <span className="truncate font-medium">
                                    {r.referrer}
                                  </span>
                                  <span className="ml-auto text-muted-foreground tabular-nums text-xs">
                                    {r.sessions}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {stats.topSources.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                              UTM Sources
                            </h4>
                            <div className="space-y-2">
                              {stats.topSources.slice(0, 5).map((s, i) => (
                                <div
                                  key={s.source}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <SourceIcon source={s.source} size={14} />
                                  <div
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ background: chartColors[i % 5] }}
                                  />
                                  <span className="truncate font-medium">
                                    {s.source}
                                  </span>
                                  <span className="ml-auto text-muted-foreground tabular-nums text-xs">
                                    {s.sessions}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No referral data yet
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          );
        })()}
      </div>
      {/* Uptime Incidents */}
      {uptimeIncidents && uptimeIncidents.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <IconHeartRateMonitor size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">Recent Incidents</h3>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Est. Lost Visitors</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {uptimeIncidents.map((incident) => (
                  <tr key={incident.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(incident.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs capitalize">{incident.type}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {incident.durationSeconds != null ? formatDuration(incident.durationSeconds) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {incident.estimatedLostVisitors != null ? `~${incident.estimatedLostVisitors}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {incident.resolvedAt ? (
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">Resolved</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-xs font-medium">Ongoing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deletion Progress Dialog */}
      {showDeletionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
            <WebsiteDeletionProgress
              websiteId={websiteId}
              onComplete={handleDeletionComplete}
              onCancel={handleDeletionCancel}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
