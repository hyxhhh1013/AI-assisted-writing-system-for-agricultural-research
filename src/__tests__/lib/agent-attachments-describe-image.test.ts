import { describe, expect, it, vi, beforeEach } from "vitest";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import { MAX_VISION_IMAGE_BYTES } from "@/lib/agent/attachments/constants";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/ai", () => ({ callAI: vi.fn() }));
import { callAI } from "@/lib/ai";

const mockCallAI = vi.mocked(callAI);

function fakePng(): string {
  const p = path.join(os.tmpdir(), "att-vision-test.png");
  fs.writeFileSync(p, Buffer.from("89504e470d0a1a0a", "hex"));
  return p;
}

describe("describeImage", () => {
  beforeEach(() => { mockCallAI.mockReset(); });

  it("returns structured description from vision model", async () => {
    mockCallAI.mockResolvedValue({
      json: async () => ({ choices: [{ message: { content: "类型：数据图\n画面描述：柱状图" } }] }),
      ok: true, status: 200,
    } as Response);
    const r = await describeImage(fakePng());
    expect(r.status).toBe("ready");
    expect(r.source).toBe("image_vision");
    expect(r.text).toContain("柱状图");
    expect(mockCallAI).toHaveBeenCalledWith(expect.objectContaining({ provider: "vision" }));
  });

  it("falls back to extract_failed on vision error", async () => {
    mockCallAI.mockRejectedValue(new Error("boom"));
    const r = await describeImage(fakePng());
    expect(r.status).toBe("extract_failed");
    expect(r.source).toBe("image_ocr");
  });

  it("rejects oversized images before calling vision", async () => {
    const big = path.join(os.tmpdir(), "att-vision-big.png");
    fs.writeFileSync(big, Buffer.alloc(MAX_VISION_IMAGE_BYTES + 1, 1));
    const r = await describeImage(big);
    expect(r.status).toBe("extract_failed");
    expect(r.source).toBe("image_ocr");
    expect(r.error).toContain("图片过大");
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});
