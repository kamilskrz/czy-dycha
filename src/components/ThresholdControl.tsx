"use client";

import { useState } from "react";
import { SLIDER_MAX, SLIDER_MIN, clampToSlider, formatThresholdInput, parseThresholdInput } from "@/ui/threshold";

interface Props {
  threshold: number;
  onChange: (zloty: number) => void;
}

export default function ThresholdControl({ threshold, onChange }: Props) {
  // Szkic pola tekstowego: pozwala wpisać „8,” zanim wartość stanie się poprawna.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatThresholdInput(threshold);
  const invalid = draft !== null && parseThresholdInput(draft) === null;

  return (
    <section aria-labelledby="threshold-heading" className="rounded-lg border border-line p-4 sm:p-5">
      <h2 id="threshold-heading" className="text-base font-semibold">
        Próg małej wpłaty
      </h2>
      <p className="mt-1 text-sm text-muted">Wpłata jest mała, gdy jej kwota nie przekracza progu (próg włącznie).</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="range"
          aria-label="Próg małej wpłaty w złotych"
          aria-valuetext={`${formatThresholdInput(threshold)} zł`}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={clampToSlider(threshold)}
          onChange={(e) => {
            setDraft(null);
            onChange(Number(e.target.value));
          }}
          className="h-6 w-full flex-1"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="threshold-input" className="sr-only">
            Wpisz próg w złotych
          </label>
          <input
            id="threshold-input"
            type="text"
            inputMode="decimal"
            value={text}
            aria-invalid={invalid}
            aria-describedby={invalid ? "threshold-error" : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseThresholdInput(e.target.value);
              if (parsed !== null) onChange(parsed);
            }}
            onBlur={() => setDraft(null)}
            className="min-h-11 w-24 rounded-md border border-line bg-background px-3 text-right text-base tabular-nums"
          />
          <span aria-hidden="true">zł</span>
        </div>
      </div>
      {invalid && (
        <p id="threshold-error" role="alert" className="mt-2 text-sm text-danger-fg">
          Wpisz kwotę w złotych, np. 10 lub 8,50.
        </p>
      )}
    </section>
  );
}
