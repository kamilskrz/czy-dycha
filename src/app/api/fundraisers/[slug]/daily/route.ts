import { getDaily } from "../../../../../server/handlers";
import { respond } from "../../../../../server/respond";

export async function GET(request: Request, ctx: RouteContext<"/api/fundraisers/[slug]/daily">) {
  const { slug } = await ctx.params;
  const threshold = new URL(request.url).searchParams.get("threshold");
  return respond((runtime) => getDaily(runtime, slug, threshold));
}
