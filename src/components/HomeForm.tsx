"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/ui/api-client";
import { normalizeLinkInput } from "@/ui/link-input";

export default function HomeForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Powrót z bfcache (przycisk „wstecz”) przywraca stronę z zawieszonym stanem „Sprawdzam…”.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = normalizeLinkInput(value);
    if (!input.ok) return setError(input.message);
    setError(null);
    setBusy(true);
    try {
      const { slug } = await api.registerLink(input.link);
      router.push(`/f/${encodeURIComponent(slug)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coś poszło nie tak. Spróbuj ponownie.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label htmlFor="link" className="text-sm font-medium">
        Link do Zbiórki na siepomaga.pl
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="link"
          name="link"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://www.siepomaga.pl/nazwa-zbiorki"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? "link-error" : "link-hint"}
          className="min-h-11 flex-1 rounded-md border border-line bg-background px-3 text-base"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-md bg-accent px-5 font-medium text-accent-contrast disabled:opacity-60"
        >
          {busy ? "Sprawdzam…" : "Sprawdź"}
        </button>
      </div>
      <p id="link-hint" className="text-sm text-muted">
        Możesz też wpisać samą nazwę z adresu, np. <code>nazwa-zbiorki</code>.
      </p>
      {error && (
        <p id="link-error" role="alert" className="rounded-md border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {error}
        </p>
      )}
    </form>
  );
}
