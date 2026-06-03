/** 写作 Prompt 共享类型 */

export type SectionPrompt = string | ((params: { isGBT: boolean; isChinese: boolean }) => string);

export type SectionPromptParams = { isGBT: boolean; isChinese: boolean };
