import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { success } from "@/lib/admin-response";
import { getAllKeys, resolveProviderModel } from "@/lib/ai";
import {
  getAgentProvider,
  MODEL_PROVIDERS,
  ModelProviderKey,
} from "@/lib/models";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** 脱敏显示 key：sk-abc…xxxx，不泄露明文 */
function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/**
 * 后台 AI 状态：每个 provider 当前生效的模型、来源（DB/env/默认）、可用 Key 列表。
 * 用于「显示当前生效模型」——不返回任何明文 key。
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const providers = await Promise.all(
    (Object.keys(MODEL_PROVIDERS) as ModelProviderKey[]).map(async (p) => {
      const config = MODEL_PROVIDERS[p];
      const dbModel = await getSetting(config.modelSettingKey);
      const model = await resolveProviderModel(p);
      const modelSource: "db" | "env" | "default" = dbModel?.trim()
        ? "db"
        : process.env[config.modelSettingKey]
          ? "env"
          : "default";
      const keys = await getAllKeys(p);
      return {
        provider: p,
        name: config.name,
        enabled: config.enabled,
        model,
        modelSource,
        keyCount: keys.length,
        keys: keys.map(maskKey),
      };
    }),
  );

  return success({
    providers,
    roles: {
      writer: getAgentProvider("writer"),
      verifier: getAgentProvider("verifier"),
      refiner: getAgentProvider("refiner"),
      planner: getAgentProvider("planner"),
    },
  });
}
