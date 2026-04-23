"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { IconTrendingUp, IconTrendingDown, IconMinus } from "@tabler/icons-react";
import { Area, AreaChart, Cell, Pie, PieChart } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface OverviewCardProps {
  totalVisitors: number;
  changePercent: number;
  dailyData: { day: string; users: number }[];
  deviceData: { name: string; value: number; fill: string }[];
  isLoading?: boolean;
}

const chartConfig = {
  users: { label: "Users", color: "var(--color-primary)" },
} satisfies ChartConfig;

const deviceChartConfig = {
  desktop: { label: "Desktop", color: "var(--color-chart-1)" },
  mobile: { label: "Mobile", color: "var(--color-chart-2)" },
  tablet: { label: "Tablet", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

export function OverviewCard({ totalVisitors, changePercent, dailyData, deviceData, isLoading }: OverviewCardProps) {
  const TrendIcon = changePercent > 0 ? IconTrendingUp : changePercent < 0 ? IconTrendingDown : IconMinus;
  const trendColor = changePercent > 0 ? "text-emerald-500" : changePercent < 0 ? "text-red-500" : "text-muted-foreground";

  if (isLoading) {
    return (
      <Card className="bg-card/70 absolute top-4 left-4 z-10 w-60 backdrop-blur-sm">
        <CardHeader>
          <Skeleton className="h-3 w-28 mb-2" />
          <Skeleton className="h-8 w-20" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="mt-4 h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/70 absolute top-4 left-4 z-10 w-60 backdrop-blur-sm">
      <CardHeader>
        <div>
          <p className="text-muted-foreground pb-2 text-[10px] tracking-wider uppercase">
            Visitors — last 7 days
          </p>
          <p className="text-3xl leading-none font-semibold tabular-nums">
            {totalVisitors.toLocaleString()}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {dailyData.length > 0 && (
          <ChartContainer config={chartConfig} className="aspect-auto h-8 w-full">
            <AreaChart data={dailyData} margin={{ left: 4, right: 4, top: 4 }}>
              <defs>
                <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-users)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-users)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="natural"
                dataKey="users"
                stroke="var(--color-users)"
                strokeWidth={1.5}
                fill="url(#usersGradient)"
              />
            </AreaChart>
          </ChartContainer>
        )}

        <div className="mt-4 flex items-center gap-1.5 text-xs">
          <TrendIcon size={12} className={trendColor} />
          <span className={`font-medium ${trendColor}`}>
            {changePercent > 0 ? "+" : ""}{changePercent.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs previous 7 days</span>
        </div>

        {deviceData.length > 0 && (
          <div className="border-border/60 mt-4 border-t pt-4">
            <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
              Device category
            </p>

            <ChartContainer config={deviceChartConfig} className="mx-auto mt-3 aspect-square h-32 w-32">
              <PieChart>
                <Pie
                  data={deviceData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={32}
                  outerRadius={52}
                  strokeWidth={2}
                >
                  {deviceData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {deviceData.map((device) => (
                <div key={device.name} className="text-center">
                  <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[10px] tracking-wide uppercase">
                    <span className="size-2 rounded-full" style={{ backgroundColor: device.fill }} />
                    {device.name}
                  </p>
                  <p className="text-foreground mt-1 leading-none font-medium tabular-nums">
                    {device.value.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
