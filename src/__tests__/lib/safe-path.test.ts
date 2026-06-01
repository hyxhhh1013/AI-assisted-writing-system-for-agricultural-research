import { describe, it, expect } from "vitest";
import path from "path";
import {
  SafePathError,
  assertSafePathSegment,
  resolveInsideBaseDir,
  assertResolvedInsideBase,
} from "@/lib/safe-path";

describe("safe-path", () => {
  const base = path.join("/tmp", "papers");

  it("rejects traversal in filename", () => {
    expect(() => assertSafePathSegment("../secret.pdf", "文件名")).toThrow(SafePathError);
    expect(() => assertSafePathSegment("a/b.pdf", "文件名")).toThrow(SafePathError);
  });

  it("resolveInsideBaseDir stays under base", () => {
    const p = resolveInsideBaseDir(base, "茶学", "paper.pdf");
    expect(p).toBe(path.resolve(base, "茶学", "paper.pdf"));
  });

  it("rejects escape via parent segments", () => {
    expect(() => resolveInsideBaseDir(base, "..", "etc", "passwd")).toThrow(SafePathError);
  });

  it("assertResolvedInsideBase rejects paths outside base", () => {
    const outside = path.resolve(base, "..", "outside.pdf");
    expect(() => assertResolvedInsideBase(base, outside)).toThrow(SafePathError);
  });
});
