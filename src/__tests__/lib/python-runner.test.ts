import { describe, expect, it } from "vitest";
import { ChildTimeoutError, runCommand } from "@/lib/python-runner";

describe("runCommand", () => {
  it("kills a hung process after timeout", async () => {
    const started = Date.now();
    await expect(runCommand(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], {
      timeoutMs: 300,
    })).rejects.toBeInstanceOf(ChildTimeoutError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("returns stdout when the process exits", async () => {
    const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ok')"], {
      timeoutMs: 5_000,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("ok");
  });
});
