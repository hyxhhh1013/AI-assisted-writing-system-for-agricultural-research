import { describe, it, expect, afterEach } from "vitest";
import { resolvePythonCmd } from "@/lib/python-cmd";

describe("resolvePythonCmd", () => {
  const original = process.env.PYTHON_CMD;
  const originalPlatform = process.platform;

  afterEach(() => {
    if (original === undefined) delete process.env.PYTHON_CMD;
    else process.env.PYTHON_CMD = original;
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("defaults to python3 on linux when env unset", () => {
    delete process.env.PYTHON_CMD;
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(resolvePythonCmd()).toBe("python3");
  });

  it("maps misconfigured python to python3 on linux", () => {
    process.env.PYTHON_CMD = "python";
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(resolvePythonCmd()).toBe("python3");
  });

  it("respects explicit python3 on linux", () => {
    process.env.PYTHON_CMD = "python3";
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(resolvePythonCmd()).toBe("python3");
  });
});
