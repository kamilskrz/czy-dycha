"use client";

import { useMemo, useState } from "react";
import type { DailyResult } from "@/ui/hooks";
import { buildTimeline, type Metric } from "@/ui/chart-data";
import { formatThresholdInput } from "@/ui/threshold";
import TimelineChart from "./TimelineChart";

const OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "count", label: "Liczba wpłat" },
  { value: "amount", label: "Kwota" },
];

export default function Timeline({ daily, threshold }: { daily: DailyResult; threshold: number }) {
  const [metric, setMetric] = useState<Metric>("count");
  const points = useMemo(() => buildTimeline(daily.data ?? [], metric), [daily.data, metric]);

  return (
    <section aria-labelledby="timeline-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="timeline-heading" className="text-base font-semibold">
          Wpłaty dzień po dniu
        </h2>
        <div role="group" aria-label="Miara na wykresie" className="inline-flex overflow-hidden rounded-md border border-line">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={metric === o.value}
              onClick={() => setMetric(o.value)}
              className={`min-h-11 px-4 text-sm font-medium ${metric === o.value ? "bg-accent text-accent-contrast" : "bg-background"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-sm text-muted">
        Małe wpłaty to wpłaty do {formatThresholdInput(threshold)} zł włącznie.{" "}
        {daily.loading && daily.data !== null && "Aktualizuję wykres…"}
      </p>
      <div className={`rounded-lg border border-line p-3 transition-opacity ${daily.loading ? "opacity-60" : ""}`}>
        {daily.error && <p role="alert" className="mb-2 text-sm text-danger-fg">{daily.error}</p>}
        {daily.data === null ? (
          <p className="py-24 text-center text-muted">{daily.error ? "Brak danych osi czasu." : "Wczytywanie osi czasu…"}</p>
        ) : points.length === 0 ? (
          <p className="py-24 text-center text-muted">Brak wpłat do pokazania na osi czasu.</p>
        ) : (
          <>
            <TimelineChart points={points} metric={metric} />
            <p className="mt-2 flex gap-4 text-sm" aria-hidden="true">
              <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-sm bg-[var(--chart-small)]" />Małe wpłaty</span>
              <span className="flex items-center gap-1"><i className="inline-block size-3 rounded-sm bg-[var(--chart-other)]" />Pozostałe</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
