// JEDNORAZOWY skrypt (zadanie 1): pobiera swieze odpowiedzi API siepomaga.pl
// do src/adapter/__fixtures__/ i zamienia dane platnikow na neutralne wartosci.
// Nie uruchamiac ponownie bez potrzeby; testy nigdy nie lacza sie z portalem.
// Limit: min. 1 s miedzy zapytaniami, 6 zapytan lacznie.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = "https://www.siepomaga.pl";
const USER_AGENT = "czydycha-research";
const OUTPUT_DIR = new URL("../src/adapter/__fixtures__/", import.meta.url);
const TARGETS = [
  { slug: "latwogang", kind: "Fundraise", name: "fundraise-latwogang" },
  { slug: "maksiu-mazurek", kind: "Needy", name: "needy-maksiu-mazurek" },
];
const PAGES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await sleep(1100);
  return res.json();
}
const save = (file, obj) =>
  writeFileSync(new URL(file, OUTPUT_DIR), JSON.stringify(obj, null, 2) + "\n");

function anonymize(p) {
  return {
    ...p,
    comment_text: null,
    payer: { id: null, name: null, sex: null, avatar_url: null, url: null, company: null },
  };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const permalink = await fetchJson(`${BASE_URL}/api/donor/web/v2/permalinks/${target.slug}?locale=pl`);
  const t = permalink.data.target;
  // Tylko pola potrzebne adapterowi (reszta to opisy, konta bankowe, avatary itd.).
  const minimal = {
    data: {
      target: {
        fundraise: t.fundraise && { id: t.fundraise.id, slug: t.fundraise.slug, title: t.fundraise.title },
        needy: t.needy && { id: t.needy.id, slug: t.needy.slug, name: t.needy.name, cause: t.needy.cause },
      },
    },
  };
  save(`${target.name}.permalink.json`, minimal);
  const id = (t.fundraise ?? t.needy).id;
  let cursor = "";
  for (let s = 1; s <= PAGES; s++) {
    const url = `${BASE_URL}/api/v1/payments?target_type=${target.kind}&target_id=${id}&sort_by=newest&locale=pl${cursor}`;
    const page = await fetchJson(url);
    const last = page.data.at(-1);
    cursor = `&after_id=${encodeURIComponent(last.id)}&after_value=${encodeURIComponent(last.state_changed_at)}`;
    save(`${target.name}.payments-${s}.json`, { data: page.data.map(anonymize) });
  }
}
