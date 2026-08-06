import { describe, expect, it } from "vitest";
import { clientRejectReason } from "@/lib/agent/attachments/client-validate";

describe("clientRejectReason", () => {
  it("passes allowed files", () => {
    expect(clientRejectReason({ name: "a.pdf", size: 1000 })).toBeNull();
    expect(clientRejectReason({ name: "d.CSV", size: 1000 })).toBeNull();
  });
  it("rejects oversize / disallowed", () => {
    expect(clientRejectReason({ name: "a.pdf", size: 21 * 1024 * 1024 })).toContain("20MB");
    expect(clientRejectReason({ name: "a.exe", size: 10 })).toContain("不支持");
  });
});
