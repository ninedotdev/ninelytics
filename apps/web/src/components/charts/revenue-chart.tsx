
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; charges: number; newCustomers?: number }>;
  currency?: string;
}

export function RevenueChart({ data, currency = "usd" }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground py-8">
        No revenue data yet
      </div>
    );
  }

  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";

  // Transform data for BarChart — needs a "name" key for x-axis
  const chartData = data.map((d) => ({
    name: new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    revenue: d.revenue,
    charges: d.charges,
    newCustomers: d.newCustomers ?? 0,
  }));

  return (
    <BarChart data={chartData} aspectRatio="3 / 1" barGap={0.3}>
      <Grid horizontal numTicksRows={4} />
      <Bar dataKey="revenue" fill="var(--chart-3)" lineCap="round" />
      <BarXAxis />
      <ChartTooltip
        rows={(point) => [
          {
            color: "var(--chart-3)",
            label: "Revenue",
            value: `${symbol}${((point.revenue as number) ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
          ...(((point.charges as number) ?? 0) > 0
            ? [{ color: "var(--chart-1)", label: "Charges", value: String(point.charges) }]
            : []),
          ...(((point.newCustomers as number) ?? 0) > 0
            ? [{ color: "var(--chart-2)", label: "New Customers", value: String(point.newCustomers) }]
            : []),
        ]}
      />
    </BarChart>
  );
}
