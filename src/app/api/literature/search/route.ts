import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api-validate";
import { literatureSearchSchema } from "@/lib/validations";
import {
  literatureSourcesQueried,
  searchExternalLiterature,
} from "@/lib/literature-search";
import { checkLiteratureRateLimit } from "@/lib/literature-rate-limit";
import type { LiteratureSearchResponse } from "@/contracts/literature";
import { logger } from "@/lib/logger";

/** POST /api/literature/search — 聚合外部文献检索 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const rl = checkLiteratureRateLimit(userId);
    if (rl) return rl;

    const { data, errorResponse: ve } = await validateBody(
      literatureSearchSchema,
      await req.json(),
    );
    if (ve) return ve;

    const hits = await searchExternalLiterature(data.query, { limit: data.limit });
    const body: LiteratureSearchResponse = {
      query: data.query,
      hits,
      sourcesQueried: literatureSourcesQueried(),
    };
    return NextResponse.json(body);
  } catch (error) {
    logger.error("Literature search error:", error);
    return NextResponse.json({ error: "检索失败" }, { status: 500 });
  }
}
