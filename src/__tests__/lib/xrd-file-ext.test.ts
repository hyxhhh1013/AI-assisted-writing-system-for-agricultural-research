import { describe, expect, it } from "vitest";
import { resolveXrdUploadExt, XRD_FILE_ACCEPT } from "@/lib/xrd-file-ext";

describe("resolveXrdUploadExt", () => {
  it("maps instrument extensions", () => {
    expect(resolveXrdUploadExt("a.xy")).toBe(".xy");
    expect(resolveXrdUploadExt("b.XYD")).toBe(".xyd");
    expect(resolveXrdUploadExt("c.ras")).toBe(".ras");
    expect(resolveXrdUploadExt("d.raw")).toBe(".raw");
  });

  it("falls back to csv", () => {
    expect(resolveXrdUploadExt("unknown.bin")).toBe(".csv");
  });

  it("exposes accept string for file inputs", () => {
    expect(XRD_FILE_ACCEPT).toContain(".xy");
    expect(XRD_FILE_ACCEPT).toContain(".raw");
  });
});
