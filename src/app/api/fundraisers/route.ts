import { registerFundraiser } from "../../../server/handlers";
import { respond } from "../../../server/respond";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Brak lub zepsuty JSON traktujemy jak brak linku; handler zwroci czytelny komunikat.
  }
  return respond((runtime) => registerFundraiser(runtime, body));
}
