// Mapowanie stanu postępu z API na to, co pokazuje UI.
import type { ProgressBody } from "@/server/handlers";
import { formatCount, pluralPl } from "./format";

export type ProgressPhase = "connecting" | "downloading" | "complete" | "failed" | "idle";

export interface ProgressView {
  phase: ProgressPhase;
  label: string;
  /** Ułamek 0-1 do paska; null, gdy nie znamy sumy (pasek nieokreślony). */
  ratio: number | null;
  isPartial: boolean;
}

const donations = (n: number) => pluralPl(n, "wpłata", "wpłaty", "wpłat");

export function describeProgress(p: ProgressBody | null): ProgressView {
  if (p === null) return { phase: "connecting", label: "Łączenie z serwerem…", ratio: null, isPartial: true };
  const downloaded = formatCount(p.downloaded);
  // Suma z portalu jest orientacyjna, więc pasek nigdy nie przekracza 100%.
  const ratio = p.expected !== null && p.expected > 0 ? Math.min(1, p.downloaded / p.expected) : null;
  switch (p.state) {
    case "complete":
      return {
        phase: "complete",
        label: `Pobrano całą historię: ${downloaded} ${donations(p.downloaded)}`,
        ratio: 1,
        isPartial: false,
      };
    case "running":
      return {
        phase: "downloading",
        label:
          p.expected !== null && p.expected > 0
            ? `Pobrano ${downloaded} z ok. ${formatCount(p.expected)} wpłat`
            : `Pobrano ${downloaded} ${donations(p.downloaded)}`,
        ratio,
        isPartial: p.isPartial,
      };
    case "failed":
      return { phase: "failed", label: `Pobieranie przerwane po ${downloaded} ${donations(p.downloaded)}`, ratio, isPartial: true };
    case "idle":
      return { phase: "idle", label: `Zapisanych wpłat: ${downloaded}`, ratio, isPartial: p.isPartial };
  }
}

/** Komunikat dla czytnika ekranu tylko przy zmianie fazy; w trakcie pobierania treść się nie zmienia, więc nie jest powtarzany. */
export function phaseAnnouncement(phase: ProgressPhase): string {
  switch (phase) {
    case "connecting":
    case "downloading":
      return "Pobieranie trwa.";
    case "complete":
      return "Pobieranie zakończone.";
    default:
      return ""; // błąd ogłasza własny role=alert, a stan „idle” nie jest zmianą wartą komunikatu
  }
}
