import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFigureTool } from "@/lib/agent/tools/read-figure";

// mock describeImage（不真调视觉 API；读文件/大小守卫在其内部）
const mDescribe = vi.hoisted(() => ({
  describeImage: vi.fn(),
}));
vi.mock("@/lib/agent/attachments/describe-image", () => ({
  describeImage: mDescribe.describeImage,
}));

// mock prisma（项目 charts 查询）
const mPrisma = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: mPrisma }));

// mock fs（仅 existsSync 文件存在性检查；读文件已移到 describeImage 内部）
const mFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ default: mFs, ...mFs }));

const ctx = {
  userId: "u1",
  projectId: "p1",
} as unknown as Parameters<typeof readFigureTool.execute>[1];

const asset = {
  id: "c1",
  imageUrl: "/api/charts/1234567890abcdef.png",
  svgUrl: undefined,
  pdfUrl: undefined,
  sectionKey: "results",
  figureId: "bar",
  caption: "柱状图",
  figureSpecEnc: "",
  createdAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mPrisma.project.findFirst.mockResolvedValue({ charts: [asset] });
  mFs.existsSync.mockReturnValue(true);
  mDescribe.describeImage.mockResolvedValue({
    status: "ready",
    text: "这是一张柱状图，X 轴为处理组，Y 轴为产量，趋势上升",
    source: "image_vision",
  });
});

describe("readFigureTool", () => {
  it("按 sectionKey 定位图表并返回视觉描述", async () => {
    const r = await readFigureTool.execute({ sectionKey: "results" }, ctx);
    expect(r.success).toBe(true);
    expect(mDescribe.describeImage).toHaveBeenCalledTimes(1);
    expect(mDescribe.describeImage).toHaveBeenCalledWith(
      expect.stringContaining("1234567890abcdef.png"),
    );
    const data = r.data as { description?: string; caption?: string };
    expect(data.description).toContain("柱状图");
    expect(data.caption).toBe("柱状图");
  });

  it("sectionKey 无图时返回可读错误", async () => {
    mPrisma.project.findFirst.mockResolvedValue({ charts: [] });
    const r = await readFigureTool.execute({ sectionKey: "methods" }, ctx);
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain("没有");
  });

  it("文件不存在时友好报错", async () => {
    mFs.existsSync.mockReturnValue(false);
    const r = await readFigureTool.execute({ sectionKey: "results" }, ctx);
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain("文件不存在");
  });

  it("拒绝路径穿越 imageUrl（..\\ 逃出 data/charts）", async () => {
    mPrisma.project.findFirst.mockResolvedValue({
      charts: [{ ...asset, imageUrl: "/api/charts/..\\..\\secret.txt" }],
    });
    const r = await readFigureTool.execute({ sectionKey: "results" }, ctx);
    expect(r.success).toBe(false);
    expect(mDescribe.describeImage).not.toHaveBeenCalled();
  });

  it("figureId 过滤返回匹配的图", async () => {
    mPrisma.project.findFirst.mockResolvedValue({
      charts: [
        { ...asset, id: "c1", figureId: "bar", imageUrl: "/api/charts/1234567890abcdef.png", caption: "柱状图" },
        { ...asset, id: "c2", figureId: "mechanism", imageUrl: "/api/charts/abcdef1234567890.png", caption: "机理图" },
      ],
    });
    const r = await readFigureTool.execute({ sectionKey: "results", figureId: "mechanism" }, ctx);
    expect(r.success).toBe(true);
    const data = r.data as { figureId?: string; caption?: string };
    expect(data.figureId).toBe("mechanism");
    expect(data.caption).toBe("机理图");
  });

  it("项目不存在时返回明确错误", async () => {
    mPrisma.project.findFirst.mockResolvedValue(null);
    const r = await readFigureTool.execute({ sectionKey: "results" }, ctx);
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain("项目不存在");
  });

  it("index 为负数/NaN 时默认最新一张（不报错）", async () => {
    mPrisma.project.findFirst.mockResolvedValue({
      charts: [
        { ...asset, id: "c1", imageUrl: "/api/charts/1234567890abcdef.png", caption: "图A" },
        { ...asset, id: "c2", imageUrl: "/api/charts/abcdef1234567890.png", caption: "图B" },
      ],
    });
    const rNeg = await readFigureTool.execute({ sectionKey: "results", index: -3 }, ctx);
    expect(rNeg.success).toBe(true);
    expect((rNeg.data as { caption?: string }).caption).toBe("图B");
    const rNan = await readFigureTool.execute({ sectionKey: "results", index: NaN }, ctx);
    expect(rNan.success).toBe(true);
    expect((rNan.data as { caption?: string }).caption).toBe("图B");
  });
});
