import { getProgress } from "../../../../../server/handlers";
import { respond } from "../../../../../server/respond";

export async function GET(_request: Request, ctx: RouteContext<"/api/fundraisers/[slug]/progress">) {
  const { slug } = await ctx.params;
  return respond((runtime) => getProgress(runtime, slug));
}
