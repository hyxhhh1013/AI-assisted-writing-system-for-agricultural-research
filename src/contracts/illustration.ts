/**
 * 机理示意观感层（FIG-MECH-ILLUSTRATE）。
 * Graphviz / mechanism_panel 仍是可编辑主渲染器；本契约只描述文生图候选。
 */

export const DEFAULT_SEEDREAM_MODEL = "doubao-seedream-4-0-250828";
export const DEFAULT_ZHIPU_IMAGE_MODEL = "cogview-4";
export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com";

export const SEEDREAM_MODEL_OPTIONS = [
  "doubao-seedream-4-0-250828",
  "doubao-seedream-4-5-251128",
] as const;

export const ZHIPU_IMAGE_MODEL_OPTIONS = [
  "cogview-4",
  "cogview-4-250304",
  "glm-image",
] as const;

export const ILLUSTRATION_PROMPT_VERSION = 1 as const;

export type IllustrationProvider = "seedream" | "zhipu";

export interface IllustrationPromptV1 {
  version: 1;
  prompt: string;
  negativePrompt: string;
  visibleText: string[];
  claim: string;
  caption: string;
}

export interface IllustrationCandidate {
  imageUrl: string;
  provider: IllustrationProvider;
  model: string;
}

export interface IllustrationRunResult {
  prompt: IllustrationPromptV1;
  candidates: IllustrationCandidate[];
  providerUsed: IllustrationProvider;
  fallback: boolean;
  sourceImageUrl: string;
}
