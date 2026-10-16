import { startSync } from "../../../../../server/handlers";
import { respond } from "../../../../../server/respond";

export async function POST(_request: Request, ctx: RouteContext<"/api/fundraisers/[slug]/sync">) {
  const { slug } = await ctx.params;
  return respond((runtime) => startSync(runtime, slug));
}
