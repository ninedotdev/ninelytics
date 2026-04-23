import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { IconArrowLeft, IconTarget, IconTrendingUp, IconUsers, IconCurrencyDollar } from "@tabler/icons-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sileo } from "sileo";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/goals/$id")({
  component: GoalDetailPage,
});

interface Goal {
  id: string;
  websiteId: string;
  name: string;
  description: string | null;
  type: "PAGEVIEW" | "EVENT" | "DURATION";
  targetValue: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    conversions: number;
  };
  website: {
    id: string;
    name: string;
  };
}

interface GoalStats {
  totalConversions: number;
  uniqueConverters: number;
  totalValue: number;
  conversionRate: number;
  conversionsOverTime: Array<{
    date: string;
    count: number;
  }>;
  topPages: Array<{
    page: string;
    count: number;
  }>;
}

function GoalDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [stats, setStats] = useState<GoalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30");

  const { data: goalData, isLoading: loadingGoal, error: goalError } = trpc.goals.byId.useQuery(
    { id }
  );

  const { data: statsData, isLoading: loadingStats } = trpc.goals.stats.useQuery(
    { id, days: parseInt(dateRange) },
    {
      enabled: !!goalData,
    }
  );

  useEffect(() => {
    if (goalError) {
      sileo.error({ title: "Failed to fetch goal details" });
      router.navigate({ to: "/goals" });
    }
  }, [goalError, router]);

  useEffect(() => {
    if (goalData) {
      setGoal(goalData as Goal);
    }
    if (statsData) {
      setStats(statsData as GoalStats);
    }
    setLoading(loadingGoal || loadingStats);
  }, [goalData, statsData, loadingGoal, loadingStats]);

  const getGoalTypeLabel = (type: string) => {
    switch (type) {
      case "PAGEVIEW":
        return "Page View";
      case "EVENT":
        return "Custom Event";
      case "DURATION":
        return "Time on Site";
      default:
        return type;
    }
  };

  const getGoalTypeColor = (type: string) => {
    switch (type) {
      case "PAGEVIEW":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "EVENT":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400";
      case "DURATION":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-48" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-lg" />
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-80 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!goal || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Goal not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.navigate({ to: "/goals" })}
            className="gap-2"
          >
            <IconArrowLeft size={16} />
            Back to Goals
          </Button>
        </div>

        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Goal Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <IconTarget size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-semibold">{goal.name}</h1>
                  <Badge className={getGoalTypeColor(goal.type)}>
                    {getGoalTypeLabel(goal.type)}
                  </Badge>
                  {!goal.isActive && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                </div>
                {goal.description && (
                  <p className="text-muted-foreground mb-2">
                    {goal.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Target:{" "}
                    <span className="font-mono font-medium">
                      {goal.targetValue}
                    </span>
                    {goal.type === "DURATION" && " seconds"}
                  </span>
                  <span>•</span>
                  <span>Website: {goal.website.name}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <IconTarget size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Conversions
                </p>
                <p className="text-2xl font-semibold">
                  {stats.totalConversions}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <IconUsers size={24} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Unique Converters
                </p>
                <p className="text-2xl font-semibold">
                  {stats.uniqueConverters}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <IconTrendingUp size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Conversion Rate
                </p>
                <p className="text-2xl font-semibold">
                  {stats.conversionRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
                <IconCurrencyDollar size={24} className="text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Value
                </p>
                <p className="text-2xl font-semibold">
                  ${stats.totalValue.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversions Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Conversions Over Time</CardTitle>
          <CardDescription>Daily conversion trend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.conversionsOverTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#888"
                  fontSize={12}
                />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                  labelFormatter={formatDate}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Converting Pages */}
      <Card>
        <CardHeader>
          <CardTitle>Top Converting Pages</CardTitle>
          <CardDescription>Pages that led to conversions</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.topPages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No data available
            </p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topPages}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis
                    dataKey="page"
                    stroke="#888"
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis stroke="#888" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.9)",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
