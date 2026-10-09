import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { panelCropsFromInk } from "@/lib/agent/figure-panels";

function frame(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  draw(ctx as unknown as CanvasRenderingContext2D);
  return ctx.getImageData(0, 0, width, height).data;
}

describe("panelCropsFromInk", () => {
  it("左右两张图按空白切开", () => {
    const data = frame(400, 240, (ctx) => {
      ctx.fillStyle = "black";
      ctx.fillRect(20, 30, 150, 180);
      ctx.fillRect(230, 30, 150, 180);
    });
    const crops = panelCropsFromInk(400, 240, data);
    expect(crops).toHaveLength(2);
    expect(crops[0]?.x).toBeLessThan(crops[1]?.x ?? 0);
  });

  it("上下两排再左右切开", () => {
    const data = frame(400, 400, (ctx) => {
      ctx.fillStyle = "black";
      ctx.fillRect(20, 20, 150, 150);
      ctx.fillRect(230, 20, 150, 150);
      ctx.fillRect(20, 230, 150, 150);
      ctx.fillRect(230, 230, 150, 150);
    });
    const crops = panelCropsFromInk(400, 400, data);
    expect(crops).toHaveLength(4);
  });

  it("单张带边框的图不切开", () => {
    const data = frame(400, 300, (ctx) => {
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, 320, 220);
      ctx.beginPath();
      ctx.moveTo(50, 200);
      ctx.lineTo(340, 80);
      ctx.stroke();
    });
    expect(panelCropsFromInk(400, 300, data)).toHaveLength(0);
  });
});
