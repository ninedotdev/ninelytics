"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  IconPlus,
  IconGlobe,
  IconDots,
  IconExternalLink,
  IconSettings,
  IconTrash,
  IconEye,
  IconChartBar,
  IconTrendingUp,
  IconLayoutGrid,
  IconList,
} from "@tabler/icons-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sileo } from "sileo";
import { AppLayout } from "@/components/layout/app-layout";
import Link from "next/link";
import { MiniSparkline } from "@/components/charts/mini-sparkline";
import { Cloudflare } from "@/components/icons/cloudflare";
import { GoogleAnalytics } from "@/components/icons/google-analytics";
import { api } from "@/utils/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimezone } from "@/hooks/use-timezone";

interface Website {
  id: string;
  name: string;
  url: string;
  description?: string;
  trackingCode: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING";
  createdAt: string;
  cloudflareLinked?: boolean;
  googleAnalyticsLinked?: boolean;
  cloudflareSyncedAt?: string | null;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  _count: {
    analyticsData: number;
  };
  quickStats?: {
    viewsLast7Days: number;
    visitorsToday: number;
    trend: number;
    last7DaysData: Array<{ date: string; views: number }>;
  };
}

export default function WebsitesPage() {
  const router = useRouter();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [total, setTotal] = useState(0);
  const [deletingWebsiteId, setDeletingWebsiteId] = useState<string | null>(null);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("websites_view") as "grid" | "list") || "grid";
  });

  const toggleView = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("websites_view", mode);
  };
  const timezone = useTimezone().timezone;
  const { data, isLoading, refetch, isFetching } = api.websites.optimized.useQuery(
    { page, pageSize, timezone },
    { placeholderData: (previousData) => previousData, staleTime: 0, refetchOnMount: true, refetchOnWindowFocus: true }
  );

  useEffect(() => {
    if (data && Array.isArray(data.items)) {
      setWebsites(data.items.map((w) => ({
        id: String(w.id ?? ""),
        name: String(w.name ?? ""),
        url: String(w.url ?? ""),
        description: w.description ? String(w.description) : undefined,
        trackingCode: String(w.trackingCode ?? ""),
        status: String(w.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE" | "PENDING",
        createdAt: String(w.createdAt ?? ""),
        cloudflareLinked: !!(w as Record<string, unknown>).cloudflareLinked,
        googleAnalyticsLinked: !!(w as Record<string, unknown>).googleAnalyticsLinked,
        cloudflareSyncedAt: (w as Record<string, unknown>).cloudflareSyncedAt as string | null | undefined,
        owner: {
          id: String(w.owner?.id ?? ""),
          name: String(w.owner?.name ?? ""),
          email: String(w.owner?.email ?? ""),
        },
        _count: {
          analyticsData: Number(w._count?.analyticsData ?? 0),
        },
        quickStats: w.quickStats ? {
          viewsLast7Days: Number(w.quickStats.viewsLast7Days ?? 0),
          visitorsToday: Number(w.quickStats.visitorsToday ?? 0),
          trend: Number(w.quickStats.trend ?? 0),
          last7DaysData: Array.isArray(w.quickStats.last7DaysData) 
            ? w.quickStats.last7DaysData.map((d: { date: unknown; views: unknown }) => ({
                date: String(d.date ?? ""),
                views: Number(d.views ?? 0),
              }))
            : [],
        } : undefined,
      })));
      setTotal(Number(data.total ?? 0));
    } else {
      setWebsites([]);
      setTotal(0);
    }
  }, [data]);

  const deleteWebsite = async (id: string) => {
    setDeletingWebsiteId(id);
    setShowDeletionDialog(true);
  };

  const handleDeletionComplete = () => {
    if (deletingWebsiteId) {
      setWebsites((prev) => prev.filter((w) => w.id !== deletingWebsiteId));
      sileo.success({ title: "Website deleted successfully!" });
      refetch();
    }
    setDeletingWebsiteId(null);
    setShowDeletionDialog(false);
  };

  const handleDeletionCancel = () => {
    setDeletingWebsiteId(null);
    setShowDeletionDialog(false);
  };

  const getDataAge = (analyticsData: number, createdAt: string) => {
    if (analyticsData >= 1) return `${analyticsData} day${analyticsData !== 1 ? "s" : ""} of data`
    // Force UTC parsing — PostgreSQL timestamps may lack the Z suffix
    const utcStr = createdAt.endsWith("Z") || createdAt.includes("+") ? createdAt : createdAt + "Z"
    const ms = Math.max(0, Date.now() - new Date(utcStr).getTime())
    const minutes = Math.floor(ms / 60_000)
    if (minutes < 60) return `${Math.max(minutes, 1)} min${minutes !== 1 ? "s" : ""} of data`
    const hours = Math.floor(ms / 3_600_000)
    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      return `${days} day${days !== 1 ? "s" : ""} of data`
    }
    return `${hours} hr${hours !== 1 ? "s" : ""} of data`
  }

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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Skeleton className="h-5 w-5 rounded-sm shrink-0" />
                      <div className="space-y-1 flex-1 min-w-0">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-8" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-7 w-12" />
                    </div>
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-7 w-8" />
                    </div>
                  </div>
                  <Skeleton className="h-[50px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild>
            <Link href="/websites/new">
              <IconPlus size={16} className="mr-2" />
              Add Website
            </Link>
          </Button>
          <div className="flex items-center rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => toggleView("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <IconLayoutGrid size={16} />
            </button>
            <button
              onClick={() => toggleView("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <IconList size={16} />
            </button>
          </div>
        </div>

        {!websites || websites.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <IconGlobe size={48} className="text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No websites yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Get started by adding your first website to track its analytics.
              </p>
              <Button asChild>
                <Link href="/websites/new">
                  <IconPlus size={16} className="mr-2" />
                  Add Your First Website
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
          {viewMode === "list" ? (
          <div className="space-y-2">
            {[...websites].sort((a, b) => {
              const trendA = a.quickStats?.trend ?? 0;
              const trendB = b.quickStats?.trend ?? 0;
              if (trendB !== trendA) return trendB - trendA;
              return (b.quickStats?.visitorsToday ?? 0) - (a.quickStats?.visitorsToday ?? 0);
            }).map((website) => {
              const trend = website.quickStats?.trend ?? 0;
              const visitorsToday = website.quickStats?.visitorsToday ?? 0;
              const views7d = website.quickStats?.viewsLast7Days ?? 0;
              const perfBadge = visitorsToday === 0 && views7d === 0
                ? { label: "Inactive", variant: "warning" as const }
                : trend >= 20
                ? { label: "On Fire", variant: "destructive" as const }
                : trend > 0
                ? { label: "Growing", variant: "success" as const }
                : trend < 0
                ? { label: "Declining", variant: "info" as const }
                : { label: "Steady", variant: "secondary" as const };
              return (
                <div
                  key={website.id}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/websites/${website.id}`)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${new URL(website.url).hostname}&sz=32`}
                    alt=""
                    width={20}
                    height={20}
                    className="rounded-sm shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{website.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{website.url}</div>
                  </div>
                  <div className="flex items-center shrink-0 text-sm tabular-nums">
                    <div className="text-right w-16">
                      <div className="font-medium">{website.quickStats?.visitorsToday ?? 0}</div>
                      <div className="text-xs text-muted-foreground">today</div>
                    </div>
                    <div className="text-right w-20">
                      <div className="font-medium">{(website.quickStats?.viewsLast7Days ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">7d views</div>
                    </div>
                    <div className="w-12 text-right">
                      {trend !== 0 ? (
                        <span className={`text-xs font-medium ${trend > 0 ? "text-green-500" : "text-red-400"}`}>
                          {trend > 0 ? "+" : ""}{trend}%
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                    <div className="w-20 text-right">
                      <Badge variant={perfBadge.variant} size="sm">
                        {perfBadge.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[...websites].sort((a, b) => {
              const trendA = a.quickStats?.trend ?? 0;
              const trendB = b.quickStats?.trend ?? 0;
              if (trendB !== trendA) return trendB - trendA;
              return (b.quickStats?.visitorsToday ?? 0) - (a.quickStats?.visitorsToday ?? 0);
            }).map((website) => {
              const trend = website.quickStats?.trend ?? 0;
              const visitorsToday = website.quickStats?.visitorsToday ?? 0;
              const views7d = website.quickStats?.viewsLast7Days ?? 0;
              const perfBadge = visitorsToday === 0 && views7d === 0
                ? { label: "Inactive", variant: "warning" as const }
                : trend >= 20
                ? { label: "On Fire", variant: "destructive" as const }
                : trend > 0
                ? { label: "Growing", variant: "success" as const }
                : trend < 0
                ? { label: "Declining", variant: "info" as const }
                : { label: "Steady", variant: "secondary" as const };
              return (
              <Card
                key={website.id}
                className="relative overflow-visible cursor-pointer transition-all duration-300 hover:shadow-lg"
                onClick={() => router.push(`/websites/${website.id}`)}
              >
                {/* Favicon badge — top-left corner */}
                <div className="absolute -top-4 left-4 z-10">
                  <div className="w-9 h-9 rounded-xl border-2 border-background bg-background shadow-md flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(website.url).hostname}&sz=32`}
                      alt=""
                      width={22}
                      height={22}
                      className="rounded-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                </div>

                {/* Performance badge — top-right corner */}
                <div className="absolute -top-2.5 right-4 z-10">
                  <Badge variant={perfBadge.variant} size="sm">
                    {perfBadge.label}
                  </Badge>
                </div>

                <CardHeader className="pb-3 pt-6">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg font-medium text-foreground truncate">
                        {website.name}
                      </CardTitle>
                      <CardDescription className="mt-1 truncate">
                        {website.url}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="sm">
                          <IconDots size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/websites/${website.id}`);
                          }}
                        >
                          <IconEye size={16} className="mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/analytics?website=${website.id}`);
                          }}
                        >
                          <IconChartBar size={16} className="mr-2" />
                          View Analytics
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(website.url, "_blank");
                          }}
                        >
                          <IconExternalLink size={16} className="mr-2" />
                          Visit Website
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/websites/${website.id}/settings`);
                          }}
                        >
                          <IconSettings size={16} className="mr-2" />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWebsite(website.id);
                          }}
                          className="text-red-600 dark:text-red-400"
                        >
                          <IconTrash size={16} className="mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge className={getStatusColor(website.status)}>
                      {website.status.toLowerCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {website.cloudflareLinked && (
                        <span className="inline-flex items-center" title="Cloudflare synced">
                          <Cloudflare className="h-4 w-4" />
                        </span>
                      )}
                      {website.googleAnalyticsLinked && (
                        <span className="inline-flex items-center" title="Google Analytics synced">
                          <GoogleAnalytics className="h-4 w-4 fill-current" />
                        </span>
                      )}
                      {getDataAge(website._count.analyticsData, website.createdAt)}
                    </span>
                  </div>

                  {website.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {website.description}
                    </p>
                  )}

                  {/* Quick Stats */}
                  {website.quickStats && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Views (7d)
                          </div>
                          <div className="text-lg font-semibold">
                            {website.quickStats.viewsLast7Days.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Visitors Today
                          </div>
                          <div className="text-lg font-semibold flex items-center gap-1">
                            {website.quickStats.visitorsToday}
                            {trend !== 0 && (
                              <span className={`text-xs font-medium ${trend > 0 ? "text-green-500" : "text-red-400"}`}>
                                {trend > 0 ? "+" : ""}{trend}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {website.quickStats.last7DaysData &&
                        website.quickStats.last7DaysData.length > 0 && (
                          <div className="pt-2">
                            <MiniSparkline
                              data={website.quickStats.last7DaysData}
                              height={50}
                            />
                          </div>
                        )}
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
          )}
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-muted-foreground">
              Page {page} · Showing {websites.length} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const maxPage = Math.max(1, Math.ceil(total / pageSize));
                  setPage((p) => (p < maxPage ? p + 1 : p));
                }}
                disabled={isFetching || page * pageSize >= total}
              >
                Next
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Deletion Progress Dialog */}
      {showDeletionDialog && deletingWebsiteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <WebsiteDeletionProgress
              websiteId={deletingWebsiteId}
              onComplete={handleDeletionComplete}
              onCancel={handleDeletionCancel}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
