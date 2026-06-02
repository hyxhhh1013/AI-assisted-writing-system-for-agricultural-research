import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "@/lib/logger";

describe("createLogger", () => {
  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    debugSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fail() 写入 error 与 message 字段", () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = createLogger("test-scope");
    log.fail("boom", new Error("kaput"), { feature: "x" });
    expect(errorSpy).toHaveBeenCalled();
    const args = errorSpy.mock.calls[0];
    expect(String(args[0])).toContain("[test-scope]");
    expect(args[1]).toBe("boom");
    expect(args[2]).toMatchObject({ feature: "x", error: "kaput" });
  });

  it("production 下 debug 不输出", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = createLogger("prod");
    log.debug("hidden");
    expect(debugSpy).not.toHaveBeenCalled();
  });
});
