import { getAllKeys } from "@/lib/ai";
import { getSetting } from "@/lib/settings";

export const DEFAULT_SEEDREAM_MODEL = "doubao-seedream-4-0-250828";
export const DEFAULT_ZHIPU_IMAGE_MODEL = "cogview-4";

export interface IllustrationRuntime {
  arkKey: string;
  zhipuKey: string;
  seedreamModel: string;
  zhipuImageModel: string;
}

export async function resolveIllustrationRuntime(): Promise<IllustrationRuntime> {
  const arkDb = (await getSetting("VOLC_ARK_API_KEY"))?.trim() ?? "";
  const seedreamDb = (await getSetting("SEEDREAM_MODEL"))?.trim() ?? "";
  const zhipuImageDb = (await getSetting("ZHIPU_IMAGE_MODEL"))?.trim() ?? "";
  const zhipuKeys = await getAllKeys("zhipu");

  return {
    arkKey: arkDb || process.env.VOLC_ARK_API_KEY?.trim() || "",
    zhipuKey: zhipuKeys[0] || process.env.ZHIPU_API_KEY?.trim() || "",
    seedreamModel: seedreamDb || process.env.SEEDREAM_MODEL?.trim() || DEFAULT_SEEDREAM_MODEL,
    zhipuImageModel:
      zhipuImageDb || process.env.ZHIPU_IMAGE_MODEL?.trim() || DEFAULT_ZHIPU_IMAGE_MODEL,
  };
}
