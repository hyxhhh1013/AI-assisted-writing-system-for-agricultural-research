import { describe, expect, it } from "vitest";
import { extractImages } from "@/components/shared/editor-image-gallery";

describe("EditorImageGallery extractImages", () => {
  it("extracts base64 embedded images (legacy behavior preserved)", () => {
    const images = extractImages(
      "![图1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA)",
    );
    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe("图1");
    expect(images[0]?.src).toContain("data:image/png;base64,");
  });

  it("extracts /api/charts URL images inserted by agent generate_chart", () => {
    const content =
      "\n\n![图3 产量对比](/api/charts/014db9da-4c00-4182-84c9-5e262ea2f195.png)\n\n";
    const images = extractImages(content);
    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe("图3 产量对比");
    expect(images[0]?.src).toBe(
      "/api/charts/014db9da-4c00-4182-84c9-5e262ea2f195.png",
    );
  });

  it("extracts https URL images", () => {
    const images = extractImages("![x](https://example.com/a.svg)");
    expect(images).toHaveLength(1);
    expect(images[0]?.src).toBe("https://example.com/a.svg");
  });

  it("extracts multiple mixed-source images in order", () => {
    const images = extractImages(
      "![base](data:image/png;base64,AAAA) 正文 ![fig](/api/charts/b.png) 结尾",
    );
    expect(images).toHaveLength(2);
    expect(images[0]?.src).toContain("data:image");
    expect(images[1]?.src).toBe("/api/charts/b.png");
  });

  it("ignores plain links and non-image markdown", () => {
    expect(extractImages("[text](/api/charts/a.png)")).toHaveLength(0);
    expect(extractImages("![a](somewhere)")).toHaveLength(0);
  });
});
