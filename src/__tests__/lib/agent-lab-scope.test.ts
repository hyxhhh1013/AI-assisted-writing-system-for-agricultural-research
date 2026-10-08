import { describe, expect, it } from "vitest";
import {
  LAB_DIRECTIONS,
  allLabCategoryNames,
  formatLabScopeBlock,
  isOffTopicLabCategory,
  resolveProjectSearchCategories,
  sanitizePlanAgainstLabScope,
} from "@/lib/agent/lab-scope";

describe("lab-scope", () => {
  it("exposes four fixed directions", () => {
    expect(LAB_DIRECTIONS).toHaveLength(4);
    expect(LAB_DIRECTIONS.map((d) => d.name)).toEqual([
      "热化学",
      "烟草",
      "烟花",
      "光与植物",
    ]);
  });

  it("lists bound knowledge categories", () => {
    const cats = allLabCategoryNames();
    expect(cats).toEqual(
      expect.arrayContaining(["热化学", "烟草", "烟花", "茶学", "控释肥类"]),
    );
    expect(cats).not.toContain("热解");
  });

  it("formatLabScopeBlock forbids topic pivot", () => {
    const block = formatLabScopeBlock({
      title: "生物炭热解综述",
      researchDirection: "热化学",
    });
    expect(block).toContain("只允许：热化学");
    expect(block).toContain("禁止规划「按实验室四方向检索」");
    expect(block).toContain("烟草");
  });

  it("locks search categories to thermochemistry for a pyrolysis review", () => {
    expect(
      resolveProjectSearchCategories({
        title: "生物油定向调控与合成气碳纳米材料综述",
        researchDirection: "热化学",
      }),
    ).toEqual(["热化学"]);
    expect(
      resolveProjectSearchCategories({
        title: "生物油综述",
        directionSlug: "thermochemistry",
      }),
    ).toEqual(["热化学"]);

    const block = formatLabScopeBlock({
      title: "生物油定向调控与合成气碳纳米材料综述",
      researchDirection: "热化学",
    });
    expect(block).toContain("只允许：热化学");
    expect(block).not.toMatch(/只允许：.*茶学/);
  });

  it("keeps a new library category named in the title", () => {
    expect(resolveProjectSearchCategories({
      title: "近红外荧光粉热稳定性",
      directionSlug: "thermochemistry",
      libraryCategories: ["荧光粉", "热化学"],
    })).toEqual(["热化学", "荧光粉"]);
  });

  it("does not treat 挥发性产物 as tea", () => {
    expect(
      resolveProjectSearchCategories({
        title: "生物油挥发性组分与合成气调控",
        researchDirection: "热化学",
      }),
    ).toEqual(["热化学"]);
  });

  it("rewrites four-direction sweep subtasks", () => {
    const plan = sanitizePlanAgainstLabScope(
      {
        subtasks: [
          {
            id: "2",
            title: "按实验室四方向检索，对齐分类：热化学/烟草/茶学/控释肥类",
            status: "pending",
            toolHints: ["search_knowledge"],
          },
        ],
      },
      ["热化学"],
    );
    expect(plan.subtasks[0]?.title).toContain("热化学");
    expect(plan.subtasks[0]?.title).not.toContain("茶学");
    expect(plan.subtasks[0]?.title).not.toContain("烟草");
  });

  it("treats other lab categories as off-topic for a thermochemistry paper", () => {
    expect(isOffTopicLabCategory("茶学", ["热化学"])).toBe(true);
    expect(isOffTopicLabCategory("烟草", ["热化学"])).toBe(true);
    expect(isOffTopicLabCategory("热化学", ["热化学"])).toBe(false);
    expect(isOffTopicLabCategory("外部摘要", ["热化学"])).toBe(false);
  });
});
