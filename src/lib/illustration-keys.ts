import { getAllKeys } from "@/lib/ai";
import { getSetting } from "@/lib/settings";
import {
  DEFAULT_ARK_BASE_URL,
  DEFAULT_SEEDREAM_MODEL,
  DEFAULT_ZHIPU_IMAGE_MODEL,
} from "@/contracts/illustration";

export {
  DEFAULT_ARK_BASE_URL,
  DEFAULT_SEEDREAM_MODEL,
  DEFAULT_ZHIPU_IMAGE_MODEL,
  SEEDREAM_MODEL_OPTIONS,
  ZHIPU_IMAGE_MODEL_OPTIONS,
} from "@/contracts/illustration";

export interface IllustrationRuntime {
  arkKey: string;
  zhipuKey: string;
  seedreamModel: string;
  zhipuImageModel: string;
  arkBaseUrl: string;
}

export type IllustrationSettingSource = "db" | "env" | "default";

export interface IllustrationProviderStatus {
  name: string;
  ready: boolean;
  model: string;
  modelSource: IllustrationSettingSource;
  keyCount: number;
  keys: string[];
  baseUrl?: string;
}

export interface IllustrationAdminStatus {
  seedream: IllustrationProviderStatus;
  zhipuImage: IllustrationProviderStatus;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function settingSource(db: string, env: string | undefined): IllustrationSettingSource {
  if (db) return "db";
  if (env?.trim()) return "env";
  return "default";
}

async function collectPrefixedKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  const v0 = (await getSetting(prefix))?.trim();
  if (v0) keys.push(v0);
  for (let i = 2; i <= 10; i++) {
    const v = (await getSetting(`${prefix}_${i}`))?.trim();
    if (v) keys.push(v);
  }
  const env0 = process.env[prefix]?.trim();
  if (env0 && !keys.includes(env0)) keys.unshift(env0);
  for (let i = 2; i <= 10; i++) {
    const envN = process.env[`${prefix}_${i}`]?.trim();
    if (envN && !keys.includes(envN)) keys.push(envN);
  }
  return keys;
}

export function arkImagesUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/api/v3/images/generations`;
}

export function arkModelsUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "");
  return `${root}/api/v3/models`;
}

export const ZHIPU_IMAGES_URL = "https://open.bigmodel.cn/api/paas/v4/images/generations";
export const ZHIPU_MODELS_URL = "https://open.bigmodel.cn/api/paas/v4/models";

export async function resolveIllustrationRuntime(): Promise<IllustrationRuntime> {
  const arkDb = (await getSetting("VOLC_ARK_API_KEY"))?.trim() ?? "";
  const seedreamDb = (await getSetting("SEEDREAM_MODEL"))?.trim() ?? "";
  const zhipuImageDb = (await getSetting("ZHIPU_IMAGE_MODEL"))?.trim() ?? "";
  const arkBaseDb = (await getSetting("VOLC_ARK_BASE_URL"))?.trim() ?? "";
  const zhipuImageKeys = await collectPrefixedKeys("ZHIPU_IMAGE_API_KEY");
  const zhipuChatKeys = await getAllKeys("zhipu");
  const arkKeys = await collectPrefixedKeys("VOLC_ARK_API_KEY");

  return {
    arkKey: arkKeys[0] || arkDb || process.env.VOLC_ARK_API_KEY?.trim() || "",
    zhipuKey:
      zhipuImageKeys[0]
      || zhipuChatKeys[0]
      || process.env.ZHIPU_API_KEY?.trim()
      || "",
    seedreamModel: seedreamDb || process.env.SEEDREAM_MODEL?.trim() || DEFAULT_SEEDREAM_MODEL,
    zhipuImageModel:
      zhipuImageDb || process.env.ZHIPU_IMAGE_MODEL?.trim() || DEFAULT_ZHIPU_IMAGE_MODEL,
    arkBaseUrl: arkBaseDb || process.env.VOLC_ARK_BASE_URL?.trim() || DEFAULT_ARK_BASE_URL,
  };
}

export async function getIllustrationAdminStatus(): Promise<IllustrationAdminStatus> {
  const runtime = await resolveIllustrationRuntime();
  const arkKeys = await collectPrefixedKeys("VOLC_ARK_API_KEY");
  const zhipuImageKeys = await collectPrefixedKeys("ZHIPU_IMAGE_API_KEY");
  const zhipuChatKeys = await getAllKeys("zhipu");
  const zhipuKeys = zhipuImageKeys.length ? zhipuImageKeys : zhipuChatKeys;
  const seedreamDb = (await getSetting("SEEDREAM_MODEL"))?.trim() ?? "";
  const zhipuImageDb = (await getSetting("ZHIPU_IMAGE_MODEL"))?.trim() ?? "";

  return {
    seedream: {
      name: "即梦 Seedream",
      ready: arkKeys.length > 0,
      model: runtime.seedreamModel,
      modelSource: settingSource(seedreamDb, process.env.SEEDREAM_MODEL),
      keyCount: arkKeys.length,
      keys: arkKeys.map(maskKey),
      baseUrl: runtime.arkBaseUrl,
    },
    zhipuImage: {
      name: "智谱绘图",
      ready: zhipuKeys.length > 0,
      model: runtime.zhipuImageModel,
      modelSource: settingSource(zhipuImageDb, process.env.ZHIPU_IMAGE_MODEL),
      keyCount: zhipuKeys.length,
      keys: zhipuKeys.map(maskKey),
      baseUrl: ZHIPU_IMAGES_URL,
    },
  };
}
