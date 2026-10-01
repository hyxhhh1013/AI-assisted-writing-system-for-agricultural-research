import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { badRequest, success } from "@/lib/admin-response";
import { validateBody } from "@/lib/api-validate";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import {
  arkModelsUrl,
  resolveIllustrationRuntime,
  ZHIPU_MODELS_URL,
} from "@/lib/illustration-keys";
import { adminIllustrationTestSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * 后台机理示意连通性：拉模型列表，不真正出图。
 * POST /api/admin/illustration-test
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse } = await validateBody(adminIllustrationTestSchema, body);
  if (errorResponse) return errorResponse;

  const runtime = await resolveIllustrationRuntime();
  const provider = data.provider;
  const testKey =
    data.apiKey?.trim()
    || (provider === "seedream" ? runtime.arkKey : runtime.zhipuKey);
  if (!testKey) {
    return badRequest(
      provider === "seedream"
        ? "未配置火山方舟 Key（VOLC_ARK_API_KEY）"
        : "未配置智谱 Key（ZHIPU_IMAGE_API_KEY 或 ZHIPU_API_KEY）",
    );
  }

  const model =
    data.model?.trim()
    || (provider === "seedream" ? runtime.seedreamModel : runtime.zhipuImageModel);
  const url = provider === "seedream"
    ? arkModelsUrl(runtime.arkBaseUrl)
    : ZHIPU_MODELS_URL;
  const label = provider === "seedream" ? "即梦 Seedream" : "智谱绘图";

  try {
    const resp = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${testKey}` },
      },
      0,
      15_000,
    );
    if (resp.ok) {
      return success(undefined, `${label} ${model} Key 可用（已拉到模型列表）`);
    }
    const text = await resp.text().catch(() => "");
    return badRequest(`连接失败 (${resp.status}): ${text.slice(0, 300)}`);
  } catch (e) {
    return badRequest(`连接失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
