"use client";

import { useMemo } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

interface DailyData {
  date: string;
  views: number;
  visitors: number;
}

interface PredictionChartProps {
  data: DailyData[];
  metric?: "views" | "visitors";
  height?: number;
  formatValue?: (value: number) => string;
}

/**
 * Weighted Moving Average with weekly seasonality for predictions.
 */
export function generatePredictions(
  historicalData: DailyData[],
  metric: "views" | "visitors",
  daysToPredict: number = 7
) {
  const values = historicalData.map((d) => d[metric]);
  if (values.length < 7) return [];

  const dowValues: Map<number, { value: number; weight: number }[]> = new Map();
  for (let i = 0; i < historicalData.length; i++) {
    const dow = new Date(historicalData[i].date + "T00:00:00Z").getUTCDay();
    const weeksAgo = Math.floor((historicalData.length - 1 - i) / 7);
    const weight = Math.max(1, 4 - weeksAgo);
    if (!dowValues.has(dow)) dowValues.set(dow, []);
    dowValues.get(dow)!.push({ value: values[i], weight });
  }

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
  const dailyTrend = avgFirst > 0 ? (avgSecond - avgFirst) / mid : 0;

  const lastDate = new Date(historicalData[historicalData.length - 1].date + "T00:00:00Z");
  const results: Array<{ date: string; value: number }> = [];

  for (let i = 1; i <= daysToPredict; i++) {
    const futureDate = new Date(lastDate);
    futureDate.setUTCDate(futureDate.getUTCDate() + i);
    const futureDow = futureDate.getUTCDay();

    const entries = dowValues.get(futureDow) ?? [];
    let weightedSum = 0;
    let weightSum = 0;
    for (const e of entries) {
      weightedSum += e.value * e.weight;
      weightSum += e.weight;
    }

    const overallAvg = values.reduce((a, b) => a + b, 0) / values.length;
    const baseValue = weightSum > 0 ? weightedSum / weightSum : overallAvg;
    const predicted = Math.max(0, Math.round(baseValue + dailyTrend * i));

    results.push({
      date: futureDate.toISOString().slice(0, 10),
      value: predicted,
    });
  }

  return results;
}

export function PredictionChart({
  data,
  metric = "views",
  formatValue,
}: PredictionChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length < 7) return [];

    const predictions = generatePredictions(data, metric, 7);

    // Today as reference + 7 predicted days — single "value" key per bar
    const today = data[data.length - 1];
    const bars: Array<{ name: string; value: number; isPredicted: boolean }> = [];

    if (today) {
      bars.push({
        name: new Date(today.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: today[metric],
        isPredicted: false,
      });
    }

    for (const p of predictions) {
      bars.push({
        name: new Date(p.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: p.value,
        isPredicted: true,
      });
    }

    return bars;
  }, [data, metric]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground py-8">
        Not enough data for predictions (need at least 7 days)
      </div>
    );
  }

  const color = metric === "views" ? "var(--chart-1)" : "var(--chart-2)";
  const label = metric === "views" ? "Views" : "Visitors";
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());

  return (
    <BarChart data={chartData} aspectRatio="3 / 1" barGap={0.25}>
      <Grid horizontal numTicksRows={4} />
      <Bar dataKey="value" fill={color} lineCap="round" />
      <BarXAxis />
      <ChartTooltip
        rows={(point) => [
          {
            color,
            label: (point.isPredicted as boolean) ? `Predicted ${label}` : label,
            value: fmt(point.value as number),
          },
        ]}
      />
    </BarChart>
  );
}
