"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { describeTimeline, type Metric, type TimelinePoint } from "@/ui/chart-data";
import { formatCount, formatDay, formatPLN, formatPLNWhole } from "@/ui/format";

interface Props {
  points: TimelinePoint[];
  metric: Metric;
}

const tooltipStyle = {
  background: "var(--background)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--foreground)",
};

/** Wykres słupkowy dzienny: małe wpłaty i pozostałe jako stos. */
export default function TimelineChart({ points, metric }: Props) {
  const money = metric === "amount";
  const format = (v: number) => (money ? formatPLN(Math.round(v * 100)) : formatCount(v));
  return (
    <div role="img" aria-label={describeTimeline(points, metric)} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={formatDay} minTickGap={48} tickLine={false} />
          <YAxis
            width={money ? 72 : 44}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(v: number) => (money ? formatPLNWhole(v * 100) : formatCount(v))}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => formatDay(String(label))}
            formatter={(value) => format(Number(value))}
            cursor={{ fill: "var(--surface)" }}
          />
          <Bar dataKey="small" name="Małe wpłaty" stackId="d" fill="var(--chart-small)" className="bar-small" isAnimationActive={false} />
          <Bar dataKey="other" name="Pozostałe wpłaty" stackId="d" fill="var(--chart-other)" className="bar-other" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
