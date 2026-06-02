import type { ProjectData } from "@/contracts/project";

type KeywordLanguage = "zh" | "en";

const DEFAULT_KEYWORDS: Record<KeywordLanguage, string[]> = {
  zh: ["农业科技", "AI辅助写作", "热化学"],
  en: ["Agricultural Science", "AI Assistant", "Thermochemistry"],
};

const splitMetadataList = (value: string): string[] =>
  value
    .split(/[;；,，、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const getKeywordItems = (project: ProjectData, language: KeywordLanguage): string[] => {
  const explicitKeywords = splitMetadataList(project.keywords || "");
  if (explicitKeywords.length > 0) return explicitKeywords;

  const directionKeywords = splitMetadataList(project.researchDirection || "");
  if (directionKeywords.length > 0) return directionKeywords.slice(0, 6);

  return DEFAULT_KEYWORDS[language];
};

export const formatKeywords = (project: ProjectData, language: KeywordLanguage): string =>
  getKeywordItems(project, language).join(language === "zh" ? "；" : ", ");

export const formatClassification = (project: ProjectData): string =>
  (project.classification || "").trim();
