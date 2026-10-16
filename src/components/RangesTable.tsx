import type { SmallDonationsImpact } from "@/stats";
import { formatCount, formatPercent, formatPLN } from "@/ui/format";
import { rangeRows } from "@/ui/ranges";

export default function RangesTable({ impact }: { impact: SmallDonationsImpact }) {
  const rows = rangeRows(impact);
  return (
    <section aria-labelledby="ranges-heading">
      <h2 id="ranges-heading" className="mb-3 text-base font-semibold">
        Wpłaty według przedziałów kwot
      </h2>
      <div
        role="region"
        aria-label="Tabela przedziałów kwot (przewijana poziomo)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line"
      >
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <caption className="sr-only">Liczba i kwota wpłat z jawną kwotą w stałych przedziałach</caption>
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Przedział</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Wpłaty</th>
              <th scope="col" className="w-1/3 px-3 py-2 font-medium">Udział</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Kwota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="px-3 py-2 font-medium">{row.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(row.count)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div aria-hidden="true" className="h-2 flex-1 rounded-full bg-surface">
                      <div className="h-2 rounded-full bg-[var(--chart-small)]" style={{ width: `${row.sharePercent}%` }} />
                    </div>
                    <span className="w-14 text-right tabular-nums">{formatPercent(row.sharePercent)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPLN(row.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
