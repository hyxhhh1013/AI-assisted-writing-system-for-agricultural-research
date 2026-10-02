import { afterEach, describe, expect, it } from "vitest";
import { chromiumCandidatePaths } from "@/lib/chromium-path";

describe("chromiumCandidatePaths", () => {
  const prev = {
    PLAYWRIGHT: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    CHROMIUM: process.env.CHROMIUM_PATH,
  };

  afterEach(() => {
    if (prev.PLAYWRIGHT === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = prev.PLAYWRIGHT;
    if (prev.CHROMIUM === undefined) delete process.env.CHROMIUM_PATH;
    else process.env.CHROMIUM_PATH = prev.CHROMIUM;
  });

  it("puts env paths first", () => {
    process.env.CHROMIUM_PATH = "/opt/chrome/chrome";
    const paths = chromiumCandidatePaths();
    expect(paths[0]).toBe("/opt/chrome/chrome");
  });
});
