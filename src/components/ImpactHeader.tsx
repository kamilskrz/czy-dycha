import type { SmallDonationsImpact } from "@/stats";
import { formatCount, formatPercent, formatPLN } from "@/ui/format";
import { formatThresholdInput } from "@/ui/threshold";

interface Props {
  title: string;
  impact: SmallDonationsImpact;
  threshold: number;
  /** Wynik częściowy: "downloading" gdy historia jest pobierana, "stalled" gdy pobieranie stoi; null gdy dane pełne lub jeszcze nieznane. */
  partial?: "downloading" | "stalled" | null;
  /** Pobieranie trwa albo jeszcze nie znamy postępu: brak wpłat z kwotą oznacza „jeszcze nie ma”, a nie „nie będzie”. */
  pending?: boolean;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{value}</p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </div>
  );
}

export default function ImpactHeader({ title, impact, threshold, partial = null, pending = false }: Props) {
  const limit = `${formatThresholdInput(threshold)} zł`;
  const known = impact.disclosedCount > 0;
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {partial && (
        <div role="status" className="mt-3 rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-warn-fg">
          <p className="font-semibold">Wynik częściowy (niepełne dane)</p>
          <p className="text-sm">
            {partial === "downloading"
              ? "Historia wpłat jest jeszcze pobierana, więc liczby będą rosnąć. Wynik zmieni się po zakończeniu."
              : "Nie pobraliśmy jeszcze całej historii wpłat, więc procenty mogą się zmienić."}
          </p>
        </div>
      )}
      <h2 className="mt-6 mb-3 text-lg font-semibold">Wpływ małych wpłat (do {limit} włącznie)</h2>
      {known ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            label="Małe wpłaty: udział w liczbie wpłat"
            value={formatPercent(impact.countPercent)}
            detail={`${formatCount(impact.small.count)} z ${formatCount(impact.disclosedCount)} wpłat z jawną kwotą ma kwotę do ${limit} włącznie.`}
          />
          <Metric
            label="Małe wpłaty: udział w zebranej kwocie"
            value={formatPercent(impact.amountPercent)}
            detail={`${formatPLN(impact.small.amountMinor)} z ${formatPLN(impact.disclosedAmountMinor)} pochodzi z wpłat do ${limit} włącznie.`}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-line bg-surface p-4 text-muted">
          {pending
            ? "Pobieranie trwa. Wynik pojawi się, gdy pobierzemy pierwsze wpłaty z jawną kwotą."
            : "Nie ma jeszcze wpłat z jawną kwotą, więc nie da się policzyć wpływu małych wpłat."}
        </p>
      )}
    </header>
  );
}
