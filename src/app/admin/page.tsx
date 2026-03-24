"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IconUsers,
  IconGlobe,
  IconEye,
  IconBuildingCommunity,
  IconShieldCheck,
  IconRefresh,
  IconTrash,
  IconDatabase,
} from "@tabler/icons-react";
import { api } from "@/utils/trpc";
import { sileo } from "sileo";
import NumberFlow from "@number-flow/react";

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "authenticated" && !session?.user?.isSuperAdmin) {
    redirect("/dashboard");
  }

  const { data: overview, isLoading } = api.admin.overview.useQuery(
    undefined,
    { enabled: session?.user?.isSuperAdmin === true }
  );

  const { data: health } = api.admin.system.health.useQuery(
    undefined,
    { enabled: session?.user?.isSuperAdmin === true }
  );

  const utils = api.useUtils();

  const refreshViews = api.admin.system.refreshViews.useMutation({
    onSuccess() {
      sileo.success({ title: "Materialized views refreshed" });
      utils.admin.system.health.invalidate();
    },
    onError(err) {
      sileo.error({ title: err.message || "Failed to refresh views" });
    },
  });

  const clearCache = api.admin.cache.clear.useMutation({
    onSuccess() {
      sileo.success({ title: "Cache cleared" });
      utils.admin.cache.status.invalidate();
    },
  });

  const clearQueue = api.admin.eventQueue.clear.useMutation({
    onSuccess() {
      sileo.success({ title: "Event queue cleared" });
      utils.admin.eventQueue.status.invalidate();
    },
  });

  if (status === "loading" || isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </AppLayout>
    );
  }

  if (!session?.user?.isSuperAdmin) return null;

  const isPersonalMode = process.env.NEXT_PUBLIC_IS_MULTI_TENANT !== "true";

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Mode indicator */}
        <div className="flex items-center gap-2">
          <Badge variant={isPersonalMode ? "secondary" : "default"}>
            {isPersonalMode ? "Personal Mode" : "Multi-Tenant Mode"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {isPersonalMode
              ? "Running as a personal analytics instance"
              : "Running as a SaaS platform"}
          </span>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">
                    <NumberFlow value={overview?.totalUsers ?? 0} />
                  </p>
                </div>
                <IconUsers size={24} className="text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Websites</p>
                  <p className="text-2xl font-bold">
                    <NumberFlow value={overview?.totalWebsites ?? 0} />
                  </p>
                </div>
                <IconGlobe size={24} className="text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Page Views</p>
                  <p className="text-2xl font-bold">
                    <NumberFlow value={overview?.totalPageViews ?? 0} />
                  </p>
                </div>
                <IconEye size={24} className="text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          {!isPersonalMode && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Organizations</p>
                    <p className="text-2xl font-bold">
                      <NumberFlow value={overview?.totalOrganizations ?? 0} />
                    </p>
                  </div>
                  <IconBuildingCommunity size={24} className="text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          )}

          {isPersonalMode && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">DB Status</p>
                    <p className="text-2xl font-bold">
                      {health?.database?.connected ? (
                        <span className="text-green-500">Online</span>
                      ) : (
                        <span className="text-red-500">Offline</span>
                      )}
                    </p>
                  </div>
                  <IconDatabase size={24} className="text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Users by Role */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconShieldCheck size={16} />
                Users by Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overview?.usersByRole.map((r) => (
                  <div key={r.role} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.role}</Badge>
                    </div>
                    <span className="font-medium tabular-nums">{r.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* System Actions */}
          <Card>
            <CardHeader>
              <CardTitle>System Actions</CardTitle>
              <CardDescription>Platform maintenance operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => refreshViews.mutate()}
                disabled={refreshViews.isPending}
              >
                <IconRefresh size={16} className={refreshViews.isPending ? "animate-spin" : ""} />
                Refresh Materialized Views
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => clearCache.mutate()}
                disabled={clearCache.isPending}
              >
                <IconTrash size={16} />
                Clear Stats Cache
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => clearQueue.mutate()}
                disabled={clearQueue.isPending}
              >
                <IconTrash size={16} />
                Clear Event Queue
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Users</CardTitle>
            <CardDescription>Last 10 registered users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview?.recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {(user.name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name ?? "No name"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.isSuperAdmin && (
                      <Badge variant="default" className="text-[10px]">Super Admin</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        {health && (
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Database and infrastructure status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Database</p>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${health.database.connected ? "bg-green-500" : "bg-red-500"}`} />
                    {health.database.connected ? "Connected" : "Disconnected"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Connection Pool</p>
                  <p className="text-sm font-medium">
                    {health.database.connectionPool?.activeConnections ?? 0} active / {health.database.connectionPool?.totalConnections ?? 0} total
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Query Performance</p>
                  <p className="text-sm font-medium">
                    {health.queryPerformance?.slowQueries ?? 0} slow queries
                  </p>
                </div>
              </div>
              {health.recommendations && health.recommendations.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Recommendations</p>
                  <ul className="text-sm space-y-1">
                    {health.recommendations.map((rec: string, i: number) => (
                      <li key={rec} className="text-muted-foreground">• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
