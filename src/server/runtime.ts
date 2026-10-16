// Jedna instancja Store i Synchronizatora na proces. Trzymana na globalThis, zeby przezyla HMR
// (przeladowanie modulow w `next dev`); inaczej single-flight dzialalby tylko w obrebie jednego zaladowania.
import { fetchPage, resolveFundraiser } from "../adapter/siepomaga";
import { openStore, type Store } from "../store/store";
import { createSynchronizer, type Synchronizer } from "../sync/synchronizer";
import { readConfig } from "./config";
import type { Deps } from "./handlers";

export interface Runtime extends Deps {
  store: Store;
  synchronizer: Synchronizer;
}

const KEY = Symbol.for("czydycha.runtime");

type GlobalWithRuntime = typeof globalThis & { [KEY]?: Runtime };

/** Sciezka bazy z DB_PATH (domyslnie data/czydycha.db), wg openStore. Reszta ustawien: zob. config.ts i .env.example. */
export function getRuntime(): Runtime {
  const g = globalThis as GlobalWithRuntime;
  if (!g[KEY]) {
    const config = readConfig();
    const store = openStore();
    g[KEY] = {
      store,
      synchronizer: createSynchronizer({
        store,
        fetchPage: (fundraiser, cursor) => fetchPage(fundraiser, cursor, config.adapter),
        ...config.synchronizer,
      }),
      resolveFundraiser: (link) => resolveFundraiser(link, config.adapter),
    };
  }
  return g[KEY];
}
