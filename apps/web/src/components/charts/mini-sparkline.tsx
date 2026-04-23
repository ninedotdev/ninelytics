
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface MiniSparklineProps {
  data: Array<{ date: string; views: number }>;
  color?: string;
  height?: number;
}

export function MiniSparkline({
  data,
  color = "#3B82F6",
  height = 40,
}: MiniSparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-xs text-gray-400">No data</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="views"
          stroke={color}
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
