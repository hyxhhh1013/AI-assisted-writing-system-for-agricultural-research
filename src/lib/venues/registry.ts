/**
 * 期刊规格登记。
 * 加一本和族规则不同的刊：在 VENUE_PROFILES 追加一行。
 * 加一种新版式：先扩 template-sections，再让登记行指向新模板编号。
 */

import type { ChartPresetId, PaperTemplateId } from "@/contracts/paper-passport";

export type { ChartPresetId, PaperTemplateId };

export type CitationStyleId = "gbt7714" | "vancouver" | "apa7" | "ieee";

export interface VenueProfile {
  id: string;
  label: string;
  aliases: string[];
  language: "zh" | "en";
  template: PaperTemplateId;
  citationStyle: CitationStyleId;
  chartPreset: ChartPresetId;
  /** 蓝图和扩写多带的一句；不写则只用刊名和字数 */
  writerNote?: string;
}

export interface VenueSuggestion {
  language: "zh" | "en";
  template: PaperTemplateId;
  citationStyle: CitationStyleId;
  chartPreset: ChartPresetId;
  source: "registry" | "family";
  profileId?: string;
  writerNote?: string;
  reason: string;
}

export const VENUE_ALIGN_FIELDS = ["language", "template", "citationStyle", "chartPreset"] as const;
export type VenueAlignField = (typeof VENUE_ALIGN_FIELDS)[number];

export interface VenueAlignable {
  language: "zh" | "en";
  template: string;
  citationStyle: CitationStyleId;
  chartPreset: ChartPresetId;
}

export const TEMPLATE_OPTIONS: { value: PaperTemplateId; label: string }[] = [
  { value: "sci", label: "标准 SCI 格式" },
  { value: "nature", label: "Nature 官方风格" },
  { value: "ieee", label: "IEEE 会刊格式" },
  { value: "gbt7713", label: "GB/T 7713" },
  { value: "cas", label: "中科院期刊风格" },
];

export const CHART_PRESET_OPTIONS: { value: ChartPresetId; label: string }[] = [
  { value: "agr_journal", label: "农业期刊双栏" },
  { value: "nature", label: "Nature 单栏" },
  { value: "print_bw", label: "黑白打印" },
];

/** 用户手改模板时带上的引用。建议函数自己带引用，不走这张表。 */
export const TEMPLATE_CITATION_MAP: Record<PaperTemplateId, CitationStyleId> = {
  gbt7713: "gbt7714",
  ieee: "ieee",
  sci: "vancouver",
  nature: "vancouver",
  cas: "gbt7714",
};

/**
 * 只登记和族规则不一样的刊。
 * 和英文 SCI / 中文国标完全相同的刊不要加。
 */
export const VENUE_PROFILES: readonly VenueProfile[] = [
  {
    id: "scientia-agricultura-sinica",
    label: "中国农业科学",
    aliases: ["中国农业科学", "Scientia Agricultura Sinica"],
    language: "zh",
    template: "cas",
    citationStyle: "gbt7714",
    chartPreset: "agr_journal",
    writerNote: "中文核心，章节标题按中科院期刊体例。",
  },
];

const TEMPLATE_IDS = new Set<string>(TEMPLATE_OPTIONS.map((item) => item.value));
const CHART_PRESET_IDS = new Set<string>(CHART_PRESET_OPTIONS.map((item) => item.value));

export function isPaperTemplateId(value: string): value is PaperTemplateId {
  return TEMPLATE_IDS.has(value);
}

export function isChartPresetId(value: string): value is ChartPresetId {
  return CHART_PRESET_IDS.has(value);
}

/** 去掉空格和常见标点，便于别名精确匹配。 */
export function normalizeVenueName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000·・.,，。:：;；\-—_/\\'’"“”()（）[\]【】]+/g, "");
}

export function assertUniqueVenueAliases(profiles: readonly VenueProfile[]): void {
  const seen = new Map<string, string>();
  for (const profile of profiles) {
    for (const name of [profile.label, ...profile.aliases]) {
      const key = normalizeVenueName(name);
      if (!key) continue;
      const prev = seen.get(key);
      if (prev && prev !== profile.id) {
        throw new Error(`期刊别名重复：${name}（${prev} 与 ${profile.id}）`);
      }
      seen.set(key, profile.id);
    }
  }
}

function buildAliasIndex(profiles: readonly VenueProfile[]): Map<string, VenueProfile> {
  assertUniqueVenueAliases(profiles);
  const index = new Map<string, VenueProfile>();
  for (const profile of profiles) {
    for (const name of [profile.label, ...profile.aliases]) {
      const key = normalizeVenueName(name);
      if (key) index.set(key, profile);
    }
  }
  return index;
}

const defaultAliasIndex = buildAliasIndex(VENUE_PROFILES);

function familySuggestion(journal: string): VenueSuggestion | null {
  const trimmed = journal.trim();
  if (!trimmed) return null;
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return {
      language: "zh",
      template: "gbt7713",
      citationStyle: "gbt7714",
      chartPreset: "agr_journal",
      source: "family",
      reason: "中文期刊族",
    };
  }
  if (/^nature(?![a-z])/i.test(trimmed)) {
    return {
      language: "en",
      template: "nature",
      citationStyle: "vancouver",
      chartPreset: "nature",
      source: "family",
      reason: "Nature 族",
    };
  }
  if (/^ieee(?![a-z])/i.test(trimmed) || /ieee transactions/i.test(trimmed)) {
    return {
      language: "en",
      template: "ieee",
      citationStyle: "ieee",
      chartPreset: "print_bw",
      source: "family",
      reason: "IEEE 族",
    };
  }
  if (/[a-z]/i.test(trimmed)) {
    return {
      language: "en",
      template: "sci",
      citationStyle: "vancouver",
      chartPreset: "agr_journal",
      source: "family",
      reason: "英文 SCI 族",
    };
  }
  return null;
}

function fromProfile(profile: VenueProfile): VenueSuggestion {
  return {
    language: profile.language,
    template: profile.template,
    citationStyle: profile.citationStyle,
    chartPreset: profile.chartPreset,
    source: "registry",
    profileId: profile.id,
    writerNote: profile.writerNote,
    reason: `登记刊「${profile.label}」`,
  };
}

export function suggestVenueProfile(
  journal: string | null | undefined,
  profiles: readonly VenueProfile[] = VENUE_PROFILES,
): VenueSuggestion | null {
  const trimmed = journal?.trim() ?? "";
  if (!trimmed) return null;
  const index = profiles === VENUE_PROFILES ? defaultAliasIndex : buildAliasIndex(profiles);
  const hit = index.get(normalizeVenueName(trimmed));
  if (hit) return fromProfile(hit);
  return familySuggestion(trimmed);
}

export function venueWriterNote(journal: string | null | undefined): string | undefined {
  const note = suggestVenueProfile(journal)?.writerNote?.trim();
  return note || undefined;
}

export function listVenueJournalNames(
  profiles: readonly VenueProfile[] = VENUE_PROFILES,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    for (const name of [profile.label, ...profile.aliases]) {
      const key = normalizeVenueName(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export function alignVenueFields<T extends VenueAlignable>(
  current: T,
  journal: string,
  touched: ReadonlySet<VenueAlignField>,
): T {
  const suggestion = suggestVenueProfile(journal);
  if (!suggestion) return current;
  return {
    ...current,
    language: touched.has("language") ? current.language : suggestion.language,
    template: touched.has("template") ? current.template : suggestion.template,
    citationStyle: touched.has("citationStyle") ? current.citationStyle : suggestion.citationStyle,
    chartPreset: touched.has("chartPreset") ? current.chartPreset : suggestion.chartPreset,
  };
}

export function venueSpecDiffers(
  current: VenueAlignable,
  journal: string,
): VenueSuggestion | null {
  const suggestion = suggestVenueProfile(journal);
  if (!suggestion) return null;
  const same = current.language === suggestion.language
    && current.template === suggestion.template
    && current.citationStyle === suggestion.citationStyle
    && current.chartPreset === suggestion.chartPreset;
  return same ? null : suggestion;
}
