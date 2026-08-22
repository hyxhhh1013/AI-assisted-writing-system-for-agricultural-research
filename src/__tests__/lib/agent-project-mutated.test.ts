import { describe, expect, it } from "vitest";
import { extractProjectMutated } from "@/lib/agent/project-mutated";

describe("extractProjectMutated", () => {
  it("detects update_paper_config success", () => {
    const info = extractProjectMutated("update_paper_config", {
      success: true,
      data: { persisted: true },
    });
    expect(info?.tool).toBe("update_paper_config");
    expect(info?.label).toBe("论文配置");
    expect(typeof info?.at).toBe("number");
  });

  it("detects generate_outline when persisted", () => {
    const info = extractProjectMutated("generate_outline", {
      success: true,
      data: { persisted: true },
    });
    expect(info?.tool).toBe("generate_outline");
  });

  it("skips preview-only import_reference", () => {
    expect(
      extractProjectMutated("import_reference", {
        success: true,
        data: { preview: true },
      }),
    ).toBeNull();
    expect(
      extractProjectMutated("import_reference", {
        success: true,
        data: { requiresConfirmation: true },
      }),
    ).toBeNull();
  });

  it("detects import_reference when persisted", () => {
    const info = extractProjectMutated("import_reference", {
      success: true,
      data: { persisted: true, referenceCount: 4 },
    });
    expect(info?.tool).toBe("import_reference");
    expect(info?.label).toBe("参考文献");
  });

  it("skips when persisted === false", () => {
    expect(
      extractProjectMutated("write_section", {
        success: true,
        data: { persisted: false },
      }),
    ).toBeNull();
  });

  it("skips write_section when QA blocked and nothing persisted", () => {
    expect(
      extractProjectMutated("write_section", {
        success: true,
        data: { persisted: null, blocked: true },
      }),
    ).toBeNull();
  });

  it("detects write_section when draft persisted", () => {
    const info = extractProjectMutated("write_section", {
      success: true,
      data: { persisted: { sectionKey: "introduction", referencesAdded: 0 } },
    });
    expect(info?.tool).toBe("write_section");
  });

  it("detects ingest_project_data when persisted", () => {
    const info = extractProjectMutated("ingest_project_data", {
      success: true,
      data: { persisted: true, fileName: "yield.csv" },
    });
    expect(info?.tool).toBe("ingest_project_data");
    expect(info?.label).toBe("数据入库");
  });

  it("ignores read-only tools", () => {
    expect(
      extractProjectMutated("inspect_project", {
        success: true,
        data: {},
      }),
    ).toBeNull();
  });
});
