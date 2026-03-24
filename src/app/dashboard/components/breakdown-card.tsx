"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface BreakdownRow {
  label: string;
  value: number;
}

interface BreakdownCardProps {
  title: string;
  rows: BreakdownRow[];
  isLoading?: boolean;
}

export function BreakdownCard({ title, rows, isLoading }: BreakdownCardProps) {
  const maxRowValue = rows.length > 0 ? Math.max(...rows.map((row) => row.value)) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground mb-2 flex items-center justify-between text-[11px] tracking-wider uppercase">
          <span>{title}</span>
          <span>Visitors</span>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/90 truncate">{row.label}</span>
                <span className="text-foreground font-medium tabular-nums">{row.value}</span>
              </div>
              <div className="bg-muted h-1 rounded-full">
                <div
                  className="h-full rounded-full bg-primary/85 transition-all"
                  style={{ width: `${maxRowValue > 0 ? (row.value / maxRowValue) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
