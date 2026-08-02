import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success, badRequest } from "@/lib/admin-response";
import { getAllKeys } from "@/lib/ai";
import { getModelConfig, ModelProviderKey } from "@/lib/models";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { validateBody } from "@/lib/api-validate";
import { adminAiTestSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";

/**
 * 后台 AI 连接测试：用指定 key（或当前配置的 key）向 provider 发一个最小请求，
 * 验证 key + model 是否可用。不落库、不记用量。apiKey 可传未保存的新 key（仅内存）。
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const { data, errorResponse } = await validateBody(adminAiTestSchema, body);
  if (errorResponse) return errorResponse;

  const { provider, model, apiKey } = data;
  const config = getModelConfig(provider as ModelProviderKey);
  // 未显式传 key 时，用「实际运行会用到的 key」：DB + env 里的第一个（与 getAllKeys 一致）
  const keys = await getAllKeys(provider as ModelProviderKey);
  const testKey = apiKey?.trim() || keys[0] || "";
  if (!testKey) return badRequest(`${config.name} API Key 未配置`);
  const testModel = model?.trim() || config.model;

  try {
    const resp = await fetchWithRetry(
      config.baseUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
          stream: false,
        }),
      },
      0, // 测试不重试
      15_000,
    );

    if (resp.ok) {
      return success(undefined, `${config.name} ${testModel} 连接正常`);
    }
    const text = await resp.text().catch(() => "");
    return badRequest(`连接失败 (${resp.status}): ${text.slice(0, 300)}`);
  } catch (e) {
    return badRequest(`连接失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
