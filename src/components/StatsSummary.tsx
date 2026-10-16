import type { SmallDonationsImpact } from "@/stats";
import { formatCount, formatPLN } from "@/ui/format";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function StatsSummary({ impact }: { impact: SmallDonationsImpact }) {
  const money = (minor: number | null) => (minor === null ? "brak danych" : formatPLN(Math.round(minor)));
  return (
    <section aria-label="Podsumowanie kwot" className="grid gap-3 sm:grid-cols-3">
      <Card label="Średnia wpłata" value={money(impact.meanMinor)} />
      <Card label="Mediana wpłaty" value={money(impact.medianMinor)} />
      <div className="rounded-lg border border-line p-4">
        <p className="text-sm text-muted">Wpłaty z ukrytą kwotą</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCount(impact.hidden)}</p>
      </div>
      <p className="text-sm text-muted sm:col-span-3">
        Portal nie ujawnia kwoty części wpłat. Takie wpłaty liczymy osobno: nie wchodzą do kwot, średniej, mediany ani do
        małych wpłat, a wszystkie wskaźniki powyżej dotyczą wyłącznie wpłat z jawną kwotą.
      </p>
    </section>
  );
}
