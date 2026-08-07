import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFigureTool } from "@/lib/agent/tools/read-figure";

// mock describeImageBuffer（不真调视觉 API）
const mDescribe = vi.hoisted(() => ({
  describeImageBuffer: vi.fn(),
}));
vi.mock("@/lib/agent/attachments/describe-image", () => ({
  describeImageBuffer: mDescribe.describeImageBuffer,
}));

// mock prisma（项目 charts 查询）
const mPrisma = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: mPrisma }));

// mock fs（读图文件）。vitest v4 对 ESM 默认导入要求 mock 提供 default 导出
const mFs = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(),
}));
vi.mock("node:fs", () => ({ default: mFs, ...mFs }));

import fs from "node:fs";
import prisma from "@/lib/prisma";

const ctx = {
  userId: "u1",
  projectId: "p1",
} as unknown as Parameters<typeof readFigureTool.execute>[1];

const asset = {
  id: "c1",
  imageUrl: "/api/charts/abc.png",
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
  mFs.readFileSync.mockReturnValue(Buffer.from("png-bytes"));
  mDescribe.describeImageBuffer.mockResolvedValue({
    status: "ready",
    text: "这是一张柱状图，X 轴为处理组，Y 轴为产量，趋势上升",
    source: "image_vision",
  });
});

describe("readFigureTool", () => {
  it("按 sectionKey 定位图表并返回视觉描述", async () => {
    const r = await readFigureTool.execute({ sectionKey: "results" }, ctx);
    expect(r.success).toBe(true);
    expect(mFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining("abc.png"));
    expect(mDescribe.describeImageBuffer).toHaveBeenCalledTimes(1);
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
});
