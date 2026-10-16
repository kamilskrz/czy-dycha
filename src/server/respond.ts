// Wspólny kształt odpowiedzi tras API: obsługa awarii przy otwieraniu Magazynu i zamiana wyniku na Response.
import { IncompatibleDatabaseError } from "../store/store";
import { ConfigError } from "./config";
import type { ErrorBody, HandlerResult } from "./handlers";
import { getRuntime, type Runtime } from "./runtime";

/** Odpowiedź 500, gdy nie da się otworzyć bazy (zła ścieżka DB_PATH, brak uprawnień, baza ze starszej wersji) albo błędna konfiguracja. */
export function runtimeFailure(e: unknown): HandlerResult<ErrorBody> {
  if (e instanceof ConfigError) {
    return {
      status: 500,
      body: { code: "invalid-config", message: `${e.message} Popraw ją i uruchom aplikację ponownie.` },
    };
  }
  if (e instanceof IncompatibleDatabaseError) {
    return {
      status: 500,
      body: {
        code: "database-incompatible",
        message:
          "Plik bazy danych pochodzi z innej wersji aplikacji. Zatrzymaj aplikację, usuń plik bazy (domyślnie data/czydycha.db) i uruchom ją ponownie.",
      },
    };
  }
  return {
    status: 500,
    body: {
      code: "database-unavailable",
      message: "Nie udało się otworzyć bazy danych. Sprawdź ścieżkę w DB_PATH i uprawnienia do zapisu, a potem uruchom aplikację ponownie.",
    },
  };
}

export async function respond(
  run: (runtime: Runtime) => HandlerResult | Promise<HandlerResult>,
  open: () => Runtime = getRuntime,
): Promise<Response> {
  let runtime: Runtime;
  try {
    runtime = open();
  } catch (e) {
    const { status, body } = runtimeFailure(e);
    return Response.json(body, { status });
  }
  const { status, body } = await run(runtime);
  return Response.json(body, { status });
}
