import { describe, expect, it } from "vitest";
import { arkImagesUrl, arkModelsUrl } from "@/lib/illustration-keys";

describe("illustration-keys urls", () => {
  it("joins Ark images and models paths without double slash", () => {
    expect(arkImagesUrl("https://ark.cn-beijing.volces.com/")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
    );
    expect(arkModelsUrl("https://ark.cn-beijing.volces.com")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/models",
    );
  });
});
