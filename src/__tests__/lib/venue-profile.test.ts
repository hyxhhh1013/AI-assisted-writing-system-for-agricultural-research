import { describe, expect, it } from "vitest";
import {
  VENUE_PROFILES,
  alignVenueFields,
  assertUniqueVenueAliases,
  listVenueJournalNames,
  suggestVenueProfile,
  venueSpecDiffers,
  venueWriterNote,
  type VenueProfile,
} from "@/lib/venues/registry";

const demo: VenueProfile = {
  id: "demo-soil-letters",
  label: "Demo Soil Letters",
  aliases: ["DSL"],
  language: "en",
  template: "sci",
  citationStyle: "apa7",
  chartPreset: "print_bw",
  writerNote: "短讯体例，讨论不超过两段。",
};

describe("suggestVenueProfile", () => {
  it("登记别名优先于族规则，并带上 writerNote", () => {
    const profiles = [...VENUE_PROFILES, demo];
    const hit = suggestVenueProfile("DSL", profiles);
    expect(hit).toMatchObject({
      source: "registry",
      profileId: "demo-soil-letters",
      citationStyle: "apa7",
      chartPreset: "print_bw",
      writerNote: "短讯体例，讨论不超过两段。",
    });
    expect(venueWriterNote("中国农业科学")).toContain("中科院");
  });

  it("生产登记别名不重复，向导列表能看到刊名", () => {
    expect(() => assertUniqueVenueAliases(VENUE_PROFILES)).not.toThrow();
    expect(listVenueJournalNames()).toContain("中国农业科学");
    expect(listVenueJournalNames()).toContain("Scientia Agricultura Sinica");
  });

  it("重复别名直接失败", () => {
    expect(() => suggestVenueProfile("x", [
      demo,
      { ...demo, id: "other", aliases: ["Demo Soil Letters"] },
    ])).toThrow(/别名重复/);
  });

  it("未登记刊名走族规则", () => {
    expect(suggestVenueProfile("土壤学报")).toMatchObject({
      source: "family",
      language: "zh",
      template: "gbt7713",
      citationStyle: "gbt7714",
      chartPreset: "agr_journal",
    });
    expect(suggestVenueProfile("Applied Soil Ecology")).toMatchObject({
      source: "family",
      language: "en",
      template: "sci",
      citationStyle: "vancouver",
      chartPreset: "agr_journal",
    });
    expect(suggestVenueProfile("Nature Plants")?.template).toBe("nature");
    expect(suggestVenueProfile("Natural Hazards")?.template).toBe("sci");
    expect(suggestVenueProfile("Science of the Total Environment")?.template).toBe("sci");
    expect(suggestVenueProfile("IEEE Transactions on Geoscience and Remote Sensing")).toMatchObject({
      template: "ieee",
      citationStyle: "ieee",
      chartPreset: "print_bw",
    });
    expect(suggestVenueProfile("中国农业科学")).toMatchObject({
      source: "registry",
      template: "cas",
    });
    expect(suggestVenueProfile("   ")).toBeNull();
  });

  it("手改过的字段不被刊名覆盖", () => {
    const current = {
      language: "zh" as const,
      template: "sci",
      citationStyle: "gbt7714" as const,
      chartPreset: "nature" as const,
    };
    const touched = new Set(["language" as const]);
    const next = alignVenueFields(current, "Applied Soil Ecology", touched);
    expect(next.language).toBe("zh");
    expect(next.template).toBe("sci");
    expect(next.citationStyle).toBe("vancouver");
    expect(next.chartPreset).toBe("agr_journal");
    expect(venueSpecDiffers(current, "Applied Soil Ecology")?.template).toBe("sci");
  });
});
