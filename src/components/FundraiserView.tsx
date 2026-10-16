"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { smallDonationsImpact } from "@/stats";
import { describeProgress } from "@/ui/progress-view";
import { useDailyTotals, useSyncController, useThrottled } from "@/ui/hooks";
import { THRESHOLD_DEFAULT } from "@/ui/threshold";
import ImpactHeader from "./ImpactHeader";
import RangesTable from "./RangesTable";
import StatsSummary from "./StatsSummary";
import SyncStatus from "./SyncStatus";
import ThresholdControl from "./ThresholdControl";
import Timeline from "./Timeline";

// Odświeżanie osi czasu w trakcie pobierania: najczęściej co 10 s, żeby wykres nie migotał.
const TIMELINE_REFRESH_MS = 10_000;

const Heading = () => <h1 className="mb-4 text-2xl font-semibold tracking-tight sm:text-3xl">Wynik Zbiórki</h1>;

function Message({ children, retry }: { children: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-4 text-danger-fg">
      <p>{children}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {retry && (
          <button type="button" onClick={retry} className="min-h-11 rounded-md bg-accent px-4 font-medium text-accent-contrast">
            Spróbuj ponownie
          </button>
        )}
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Wróć na stronę główną
        </Link>
      </div>
    </div>
  );
}

export default function FundraiserView({ slug }: { slug: string }) {
  const { snapshot, retry } = useSyncController(slug);
  const [threshold, setThreshold] = useState(THRESHOLD_DEFAULT);
  const { histogram, progress } = snapshot;

  // Statystyki liczone w przeglądarce na histogramie; ruch suwaka nie woła serwera.
  const impact = useMemo(() => (histogram ? smallDonationsImpact(histogram, threshold) : null), [histogram, threshold]);
  const downloaded = progress?.downloaded ?? 0;
  const throttledDownloaded = useThrottled(downloaded, TIMELINE_REFRESH_MS);
  // W trakcie pobierania oś czasu odświeża się rzadko; po zakończeniu (lub błędzie) od razu z pełnymi danymi.
  const daily = useDailyTotals(slug, threshold, progress?.state === "running" ? throttledDownloaded : downloaded);

  // Przed pierwszą odpowiedzią serwera nie wiemy, czy dane są niepełne, więc nie straszymy banerem.
  const view = describeProgress(progress);
  const partial = progress === null || !view.isPartial ? null : view.phase === "downloading" ? "downloading" : "stalled";

  if (snapshot.notFound) {
    return (
      <>
        <Heading />
        <Message>Nie znamy takiej Zbiórki. Wklej jej link na stronie głównej.</Message>
      </>
    );
  }
  if (snapshot.loadError && !histogram) {
    return (
      <>
        <Heading />
        <Message retry={retry}>{snapshot.loadError}</Message>
      </>
    );
  }
  if (!histogram || !impact) {
    return (
      <>
        <Heading />
        <p className="text-muted" role="status">Wczytywanie wyniku…</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Link href="/" className="inline-flex min-h-11 items-center self-start text-sm text-muted underline">
        ← Inna Zbiórka
      </Link>
      <ImpactHeader title={histogram.title} impact={impact} threshold={threshold} partial={partial} pending={progress === null || view.phase === "downloading"} />
      {snapshot.loadError && <Message retry={retry}>{snapshot.loadError}</Message>}
      <SyncStatus progress={progress} onRetry={retry} />
      <ThresholdControl threshold={threshold} onChange={setThreshold} />
      <StatsSummary impact={impact} />
      <RangesTable impact={impact} />
      <Timeline daily={daily} threshold={threshold} />
    </div>
  );
}
