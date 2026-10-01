/**
 * 机理示意观感层（FIG-MECH-ILLUSTRATE）。
 * Graphviz / mechanism_panel 仍是可编辑主渲染器；本契约只描述文生图候选。
 */

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
