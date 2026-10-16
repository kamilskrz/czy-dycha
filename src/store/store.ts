import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Cursor, DailyTotals, Donation, Fundraiser, Histogram } from "../domain/types";

/** Stan Synchronizacji jednej Zbiórki. */
export interface SyncState {
  cursor: Cursor | null;
  /** Czy Historia wpłat została pobrana do końca. */
  historyComplete: boolean;
  /** ISO 8601 (UTC) czasu ostatniej Synchronizacji. */
  lastSyncAt: string | null;
}

// ADR 0001: wyłącznie id, kwota, czas/dzień i identyfikator Zbiórki. Zero danych płatnika.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS fundraisers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  expected_donations INTEGER,
  cursor_after_id TEXT,
  cursor_after_value TEXT,
  history_complete INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT
);
CREATE TABLE IF NOT EXISTS donations (
  id TEXT NOT NULL,
  fundraiser_id TEXT NOT NULL REFERENCES fundraisers(id),
  amount_minor INTEGER,
  paid_at TEXT NOT NULL,
  paid_at_ms INTEGER NOT NULL,
  day TEXT NOT NULL,
  recurring INTEGER NOT NULL,
  PRIMARY KEY (fundraiser_id, id)
);
CREATE INDEX IF NOT EXISTS donations_fundraiser_amount ON donations (fundraiser_id, amount_minor);
CREATE INDEX IF NOT EXISTS donations_fundraiser_day ON donations (fundraiser_id, day);
`;

/** Wersja schematu zapisana w PRAGMA user_version. */
const SCHEMA_VERSION = 1;

/** Baza z innej (starszej lub nowszej) wersji aplikacji; użytkownik ma ją usunąć. */
export class IncompatibleDatabaseError extends Error {
  constructor() {
    super("Incompatible database schema");
    this.name = "IncompatibleDatabaseError";
  }
}

export class Store {
  constructor(private readonly db: Database.Database) {
    this.checkVersion();
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    // Lokalne bazy sprzed dodania kolumny: jedyna "migracja" w v1 (reszta schematu bez zmian).
    if (!this.columns("fundraisers").includes("expected_donations")) {
      db.exec("ALTER TABLE fundraisers ADD COLUMN expected_donations INTEGER");
    }
  }

  /**
   * Starsza baza (np. z pojedynczym kluczem głównym wpłat) nie pasuje do schematu i dałaby tajemniczy błąd SQLite.
   * Wersja 0 oznacza albo pustą bazę, albo bazę sprzed numerowania; tę drugą rozpoznajemy po kluczu głównym wpłat.
   */
  private checkVersion(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version === SCHEMA_VERSION) return;
    if (version !== 0) throw new IncompatibleDatabaseError();
    const info = this.db.pragma("table_info(donations)") as Array<{ name: string; pk: number }>;
    if (info.length === 0) return; // pusta baza albo bez tabeli wpłat
    const key = info.filter((c) => c.pk > 0).map((c) => c.name).sort();
    if (key.join() !== "fundraiser_id,id") throw new IncompatibleDatabaseError();
  }

  private upsertFundraiser(fundraiser: Fundraiser): void {
    this.db
      .prepare(
        `INSERT INTO fundraisers (id, kind, slug, title, expected_donations) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, slug = excluded.slug, title = excluded.title,
           expected_donations = COALESCE(excluded.expected_donations, expected_donations)`,
      )
      .run(fundraiser.id, fundraiser.kind, fundraiser.slug, fundraiser.title, fundraiser.expectedDonations ?? null);
  }

  /** Walidacja jawna, zeby blad byl czytelny (a nie ogolne naruszenie NOT NULL). Zwraca czas w ms. */
  private validate(d: Donation): number {
    const ms = typeof d.paidAt === "string" ? Date.parse(d.paidAt) : NaN;
    if (Number.isNaN(ms)) throw new Error(`Invalid paidAt for donation ${d.id}: ${String(d.paidAt)}`);
    if (d.amountMinor !== null && !(Number.isInteger(d.amountMinor) && d.amountMinor >= 0)) {
      throw new Error(`Invalid amountMinor for donation ${d.id}: ${String(d.amountMinor)}`);
    }
    return ms;
  }

  /** Wstawia Wplaty (dedup po Zbiórce i id); zwraca liczbe faktycznie nowych. */
  private insertDonations(fundraiser: Fundraiser, donations: Donation[]): number {
    const insert = this.db.prepare(
      `INSERT INTO donations (id, fundraiser_id, amount_minor, paid_at, paid_at_ms, day, recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(fundraiser_id, id) DO NOTHING`,
    );
    let inserted = 0;
    for (const d of donations) {
      const ms = this.validate(d);
      inserted += insert.run(d.id, fundraiser.id, d.amountMinor, d.paidAt, ms, d.day, d.recurring ? 1 : 0).changes;
    }
    return inserted;
  }

  /**
   * Wpłaty i kursor w jednej transakcji; deduplikacja po id Wpłaty.
   * Gdy kursor jest null (ostatnia strona), Historia wpłat jest oznaczana jako pełna w tej samej transakcji.
   * Niepusty kursor nigdy nie cofa znacznika pełnej Historii.
   * Zwraca liczbę nowych Wpłat.
   */
  savePage(fundraiser: Fundraiser, donations: Donation[], cursor: Cursor | null): number {
    return this.db.transaction(() => {
      this.upsertFundraiser(fundraiser);
      const inserted = this.insertDonations(fundraiser, donations);
      this.db
        .prepare(`UPDATE fundraisers SET cursor_after_id = ?, cursor_after_value = ?, history_complete = CASE WHEN ? = 1 THEN 1 ELSE history_complete END WHERE id = ?`)
        .run(cursor?.afterId ?? null, cursor?.afterValue ?? null, cursor === null ? 1 : 0, fundraiser.id);
      return inserted;
    })();
  }

  /** Dopisuje nowe Wpłaty z poczatku listy bez ruszania kursora i stanu Historii wpłat (jedna transakcja). */
  saveNewDonations(fundraiser: Fundraiser, donations: Donation[]): number {
    return this.db.transaction(() => {
      this.upsertFundraiser(fundraiser);
      return this.insertDonations(fundraiser, donations);
    })();
  }

  /** Rejestruje Zbiórkę (potrzebne przed zapisem czasu Synchronizacji, gdy nie ma jeszcze Wpłat). */
  registerFundraiser(fundraiser: Fundraiser): void {
    this.upsertFundraiser(fundraiser);
  }

  /** Zbiórka po slugu (do tras API); null, gdy nikt jej jeszcze nie zarejestrował. */
  fundraiserBySlug(slug: string): Fundraiser | null {
    const r = this.db
      .prepare(`SELECT id, kind, slug, title, expected_donations FROM fundraisers WHERE slug = ? LIMIT 1`)
      .get(slug) as { id: string; kind: Fundraiser["kind"]; slug: string; title: string; expected_donations: number | null } | undefined;
    if (!r) return null;
    return {
      id: r.id,
      kind: r.kind,
      slug: r.slug,
      title: r.title,
      ...(r.expected_donations !== null && { expectedDonations: r.expected_donations }),
    };
  }

  /** Liczba zapisanych Wpłat Zbiórki (z jawną i ukrytą kwotą). */
  donationCount(fundraiserId: string): number {
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM donations WHERE fundraiser_id = ?`).get(fundraiserId) as { n: number };
    return n;
  }

  /** Czy Wpłata jest znana w tej Zbiórce (ta sama płatność może wystąpić w kilku Zbiórkach). */
  hasDonation(fundraiserId: string, id: string): boolean {
    return this.db.prepare(`SELECT 1 FROM donations WHERE fundraiser_id = ? AND id = ?`).get(fundraiserId, id) !== undefined;
  }

  histogram(fundraiserId: string): Histogram {
    const rows = this.db
      .prepare(
        `SELECT amount_minor AS amount, COUNT(*) AS count FROM donations
         WHERE fundraiser_id = ? AND amount_minor IS NOT NULL
         GROUP BY amount_minor ORDER BY amount_minor`,
      )
      .all(fundraiserId) as Array<{ amount: number; count: number }>;
    const { n } = this.db
      .prepare(`SELECT COUNT(*) AS n FROM donations WHERE fundraiser_id = ? AND amount_minor IS NULL`)
      .get(fundraiserId) as { n: number };
    return { amounts: rows.map((r) => [r.amount, r.count]), hidden: n };
  }

  /** Sumy po Dniu wpłaty; Mała wpłata = kwota nie większa od progu. */
  dailyTotals(fundraiserId: string, thresholdMinor: number): DailyTotals[] {
    const rows = this.db
      .prepare(
        `SELECT day,
           COALESCE(SUM(amount_minor IS NOT NULL AND amount_minor <= @threshold), 0) AS small_count,
           COALESCE(SUM(CASE WHEN amount_minor <= @threshold THEN amount_minor END), 0) AS small_amount,
           COALESCE(SUM(amount_minor IS NOT NULL AND amount_minor > @threshold), 0) AS other_count,
           COALESCE(SUM(CASE WHEN amount_minor > @threshold THEN amount_minor END), 0) AS other_amount,
           COALESCE(SUM(amount_minor IS NULL), 0) AS hidden
         FROM donations WHERE fundraiser_id = @fundraiser GROUP BY day ORDER BY day`,
      )
      .all({ threshold: thresholdMinor, fundraiser: fundraiserId }) as Array<Record<string, number | string>>;
    return rows.map((r) => ({
      day: r.day as string,
      small: { count: r.small_count as number, amountMinor: r.small_amount as number },
      other: { count: r.other_count as number, amountMinor: r.other_amount as number },
      hidden: r.hidden as number,
    }));
  }

  syncState(fundraiserId: string): SyncState {
    const f = this.db
      .prepare(
        `SELECT cursor_after_id, cursor_after_value, history_complete, last_sync_at
         FROM fundraisers WHERE id = ?`,
      )
      .get(fundraiserId) as
      | {
          cursor_after_id: string | null;
          cursor_after_value: string | null;
          history_complete: number;
          last_sync_at: string | null;
        }
      | undefined;
    if (!f) {
      return { cursor: null, historyComplete: false, lastSyncAt: null };
    }
    return {
      cursor:
        f.cursor_after_id !== null && f.cursor_after_value !== null
          ? { afterId: f.cursor_after_id, afterValue: f.cursor_after_value }
          : null,
      historyComplete: f.history_complete === 1,
      lastSyncAt: f.last_sync_at,
    };
  }

  recordSyncTime(fundraiserId: string, timeIso: string): void {
    this.db.prepare(`UPDATE fundraisers SET last_sync_at = ? WHERE id = ?`).run(timeIso, fundraiserId);
  }

  /** Nazwy kolumn tabeli (do testu schematu pod kątem ADR 0001). */
  columns(table: "fundraisers" | "donations"): string[] {
    return (this.db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
  }

  close(): void {
    this.db.close();
  }
}

/** Ścieżka: parametr, w przeciwnym razie DB_PATH, w przeciwnym razie plik lokalny. */
export function openStore(path: string = process.env.DB_PATH ?? "data/czydycha.db"): Store {
  if (path !== ":memory:" && !path.startsWith("file:")) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  try {
    return new Store(db);
  } catch (e) {
    db.close();
    throw e;
  }
}
