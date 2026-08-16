import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("使用指南文案对齐 Agent 主入口", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../../app/guide/page.tsx"),
    "utf8",
  );

  it("leads to Agent workbench, not the old 7-step writing tab", () => {
    expect(src).toContain("/workbench?tab=agent");
    expect(src).toContain("在 Agent 里写（主路径）");
    expect(src).not.toContain("右侧面板实时显示 7 步管道");
    expect(src).not.toContain("左侧点击「论证提纲」标签");
  });

  it("keeps outline/writing pipeline as optional expert tools", () => {
    expect(src).toContain("专家工具");
    expect(src).toContain("协作扩写");
  });
});
