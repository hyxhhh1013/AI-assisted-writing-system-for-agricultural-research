/**
 * 工作坊配置 → GrainScript PaperPassport Phase 0 配置
 * （字段比 skill 配置少，做尽力映射）
 */

import type { PaperConfigRecord } from "@/contracts/paper-passport";
import type { PaperConfigurationRecord } from "./types";

export function studioConfigToPassport(config: PaperConfigurationRecord): PaperConfigRecord {
  const paperType =
    config.paperType === "literature_review" || config.paperType === "policy_brief"
      ? "review"
      : "research";

  let citationStyle: PaperConfigRecord["citationStyle"] = "apa7";
  if (config.citationFormat === "vancouver") citationStyle = "vancouver";
  else if (config.citationFormat === "ieee") citationStyle = "ieee";
  else if (config.citationFormat === "apa7") citationStyle = "apa7";
  // chicago / mla → apa7（Passport 暂无对应项）

  const language: PaperConfigRecord["language"] =
    config.bodyLanguage === "en" ? "en" : "zh";

  return {
    paperTitle: (config.topic ?? "").trim() || "未命名论文",
    paperType,
    targetJournal: (config.targetJournal ?? "").trim() || "",
    wordCount: String(config.wordCountTarget || 6000),
    language,
    citationStyle,
  };
}
