import { describe, expect, it } from "vitest";
import { popNavBack, pushNavPath, workbenchFallback } from "@/lib/navigation";

describe("navigation stack", () => {
  it("pushNavPath 忽略连续重复路径", () => {
    const s = pushNavPath(["/a"], "/a");
    expect(s).toEqual(["/a"]);
  });

  it("popNavBack 返回上一页", () => {
    const stack = ["/projects", "/workbench?id=1", "/plot?id=1"];
    const { stack: next, target } = popNavBack(stack);
    expect(target).toBe("/workbench?id=1");
    expect(next).toEqual(["/projects", "/workbench?id=1"]);
  });

  it("栈只有一页时 pop 为 null", () => {
    const { target } = popNavBack(["/projects"]);
    expect(target).toBeNull();
  });
});

describe("workbenchFallback", () => {
  it("有 projectId 时回工作台", () => {
    expect(workbenchFallback("abc")).toBe("/workbench?id=abc");
  });

  it("无 projectId 时回项目列表", () => {
    expect(workbenchFallback(null)).toBe("/projects");
  });
});
