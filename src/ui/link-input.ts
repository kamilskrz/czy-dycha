// Normalizacja tego, co użytkownik wpisał na stronie głównej: link albo sam slug.

const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;

export type LinkInput = { ok: true; link: string } | { ok: false; message: string };

export function normalizeLinkInput(raw: string): LinkInput {
  const text = raw.trim();
  if (text === "") return { ok: false, message: "Wklej link do Zbiórki z siepomaga.pl albo jej nazwę z adresu." };
  if (/\s/.test(text)) return { ok: false, message: "Link nie może zawierać spacji." };
  if (SLUG.test(text)) return { ok: true, link: `https://www.siepomaga.pl/${text}` };
  if (!text.includes(".")) return { ok: false, message: "To nie wygląda na link do siepomaga.pl." };
  return { ok: true, link: text };
}
