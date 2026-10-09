/**
 * 一页成图里若有多张图，按贯穿的空白切开。
 * 切不开就当整页一张，不猜面板位置。
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface NormCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_PANELS = 6;

function luminance(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return false;
  return r * 0.299 + g * 0.587 + b * 0.114 < 245;
}

function buildInkGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { gw: number; gh: number; ink: Uint8Array } {
  const gw = Math.min(200, width);
  const gh = Math.max(1, Math.round(height * (gw / width)));
  const ink = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const gy = Math.min(gh - 1, Math.floor((y * gh) / height));
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 255)) continue;
      const gx = Math.min(gw - 1, Math.floor((x * gw) / width));
      ink[gy * gw + gx] = 1;
    }
  }
  return { gw, gh, ink };
}

function rowEmpty(ink: Uint8Array, gw: number, box: Box, y: number): boolean {
  const start = y * gw + box.x;
  for (let x = 0; x < box.w; x += 1) {
    if (ink[start + x]) return false;
  }
  return true;
}

function colEmpty(ink: Uint8Array, gw: number, box: Box, x: number): boolean {
  for (let y = 0; y < box.h; y += 1) {
    if (ink[(box.y + y) * gw + x]) return false;
  }
  return true;
}

function longestInteriorGap(
  length: number,
  emptyAt: (index: number) => boolean,
  minGap: number,
): { at: number; len: number } | null {
  let best: { at: number; len: number } | null = null;
  let run = 0;
  let start = 0;
  for (let i = 0; i <= length; i += 1) {
    if (i < length && emptyAt(i)) {
      if (run === 0) start = i;
      run += 1;
      continue;
    }
    const touchesEdge = start === 0 || start + run >= length;
    if (!touchesEdge && run >= minGap && (!best || run > best.len)) {
      best = { at: start, len: run };
    }
    run = 0;
  }
  return best;
}

function bigEnough(box: Box, page: Box): boolean {
  return box.w >= page.w * 0.12 && box.h >= page.h * 0.12;
}

function splitBox(ink: Uint8Array, gw: number, page: Box, box: Box, minGap: number): Box[] {
  const rowGap = longestInteriorGap(box.h, (i) => rowEmpty(ink, gw, box, box.y + i), minGap);
  if (rowGap) {
    const top: Box = { x: box.x, y: box.y, w: box.w, h: rowGap.at };
    const bottom: Box = {
      x: box.x,
      y: box.y + rowGap.at + rowGap.len,
      w: box.w,
      h: box.h - rowGap.at - rowGap.len,
    };
    if (bigEnough(top, page) && bigEnough(bottom, page)) {
      return [
        ...splitBox(ink, gw, page, top, minGap),
        ...splitBox(ink, gw, page, bottom, minGap),
      ];
    }
  }
  const colGap = longestInteriorGap(box.w, (i) => colEmpty(ink, gw, box, box.x + i), minGap);
  if (colGap) {
    const left: Box = { x: box.x, y: box.y, w: colGap.at, h: box.h };
    const right: Box = {
      x: box.x + colGap.at + colGap.len,
      y: box.y,
      w: box.w - colGap.at - colGap.len,
      h: box.h,
    };
    if (bigEnough(left, page) && bigEnough(right, page)) {
      return [
        ...splitBox(ink, gw, page, left, minGap),
        ...splitBox(ink, gw, page, right, minGap),
      ];
    }
  }
  return [box];
}

function contentBox(ink: Uint8Array, gw: number, gh: number): Box | null {
  let minX = gw;
  let minY = gh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      if (!ink[y * gw + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 至少两块才返回。坐标相对整图，0–1。 */
export function panelCropsFromInk(width: number, height: number, data: Uint8ClampedArray): NormCrop[] {
  if (width < 8 || height < 8) return [];
  const { gw, gh, ink } = buildInkGrid(data, width, height);
  const content = contentBox(ink, gw, gh);
  if (!content) return [];
  const minGap = Math.max(2, Math.round(Math.min(gw, gh) * 0.02));
  const parts = splitBox(ink, gw, content, content, minGap);
  if (parts.length < 2 || parts.length > MAX_PANELS) return [];
  return parts.map((box) => ({
    x: box.x / gw,
    y: box.y / gh,
    w: box.w / gw,
    h: box.h / gh,
  }));
}

export async function splitPngPanelCrops(png: Buffer): Promise<NormCrop[]> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, image.width, image.height);
  return panelCropsFromInk(image.width, image.height, frame.data);
}

export async function cropPng(png: Buffer, crop: NormCrop): Promise<Buffer> {
  const image = await loadImage(png);
  const x = Math.max(0, Math.round(crop.x * image.width));
  const y = Math.max(0, Math.round(crop.y * image.height));
  const w = Math.max(1, Math.min(image.width - x, Math.round(crop.w * image.width)));
  const h = Math.max(1, Math.min(image.height - y, Math.round(crop.h * image.height)));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  return canvas.toBuffer("image/png");
}

export function panelLetter(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}
