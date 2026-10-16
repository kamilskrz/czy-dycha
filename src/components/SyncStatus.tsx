"use client";

import type { ProgressBody } from "@/server/handlers";
import { formatLastSync } from "@/ui/format";
import { describeProgress, phaseAnnouncement } from "@/ui/progress-view";
import { useNow } from "@/ui/use-now";

interface Props {
  progress: ProgressBody | null;
  onRetry: () => void;
}

function Bar({ ratio, labelledBy }: { ratio: number | null; labelledBy: string }) {
  const percent = ratio === null ? undefined : Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 overflow-hidden rounded-full bg-line"
    >
      {ratio === null ? (
        <div className="h-2 w-1/3 rounded-full bg-accent motion-safe:animate-[indeterminate_1.4s_linear_infinite]" />
      ) : (
        <div className="h-2 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${ratio * 100}%` }} />
      )}
    </div>
  );
}

/** Pasek postępu, czas ostatniej synchronizacji i błąd pobierania. */
export default function SyncStatus({ progress, onRetry }: Props) {
  const now = useNow();
  const view = describeProgress(progress);
  const failed = view.phase === "failed";
  const downloading = view.phase === "downloading" || view.phase === "connecting";
  // Przed pierwszym zakończeniem pobierania „nie synchronizowano” byłoby mylące: pobieranie właśnie trwa.
  const lastSync =
    progress?.lastSyncAt == null && downloading ? "Pobieranie trwa" : formatLastSync(progress?.lastSyncAt ?? null, now);

  return (
    <section aria-label="Stan pobierania" className="flex flex-col gap-3">
      {/* aria-live tylko dla zmian fazy; tekst jest stały w trakcie pobierania, więc kolejne odczyty postępu nie są ogłaszane */}
      <p role="status" className="sr-only">
        {phaseAnnouncement(view.phase)}
      </p>
      {failed && progress?.error && (
        <div role="alert" className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-danger-fg">
          <p>{progress.error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 rounded-md bg-accent px-4 font-medium text-accent-contrast"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      <div className="rounded-lg border border-line p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <span id="sync-label">{view.label}</span>
          <span className="text-muted">
            Ostatnia synchronizacja: {lastSync}
          </span>
        </div>
        {(downloading || view.ratio !== null) && <Bar ratio={downloading && progress === null ? null : view.ratio} labelledBy="sync-label" />}
      </div>
    </section>
  );
}
