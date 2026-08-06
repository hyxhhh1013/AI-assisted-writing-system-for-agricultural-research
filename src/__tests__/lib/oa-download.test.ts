import { describe, expect, it, vi, afterEach } from "vitest";
import {
  validateOaPdfUrl,
  downloadOaPdf,
  isOaAutoImportEnabled,
} from "@/lib/oa-download";

describe("validateOaPdfUrl", () => {
  it("accepts https OA links", () => {
    const r = validateOaPdfUrl("https://example.com/paper.pdf");
    expect(r.ok).toBe(true);
  });

  it("blocks localhost / private hosts", () => {
    expect(validateOaPdfUrl("http://127.0.0.1/a.pdf").ok).toBe(false);
    expect(validateOaPdfUrl("http://192.168.1.2/a.pdf").ok).toBe(false);
    expect(validateOaPdfUrl("http://localhost/a.pdf").ok).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(validateOaPdfUrl("file:///tmp/a.pdf").ok).toBe(false);
  });
});

describe("downloadOaPdf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts PDF magic bytes", async () => {
    const pdf = Buffer.from("%PDF-1.4\n% mock");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(pdf, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );
    const r = await downloadOaPdf("https://cdn.example.com/x.pdf");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects HTML disguised as download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>paywall</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const r = await downloadOaPdf("https://cdn.example.com/x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_pdf");
  });
});

describe("isOaAutoImportEnabled", () => {
  afterEach(() => {
    delete process.env.ENABLE_OA_AUTO_IMPORT;
  });

  it("respects ENABLE_OA_AUTO_IMPORT=0", async () => {
    process.env.ENABLE_OA_AUTO_IMPORT = "0";
    expect(await isOaAutoImportEnabled()).toBe(false);
  });

  it("defaults to enabled", async () => {
    delete process.env.ENABLE_OA_AUTO_IMPORT;
    expect(await isOaAutoImportEnabled()).toBe(true);
  });
});
