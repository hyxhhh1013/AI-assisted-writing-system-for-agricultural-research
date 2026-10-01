import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  IllustrationCandidate,
  IllustrationPromptV1,
  IllustrationProvider,
  IllustrationRunResult,
} from "@/contracts/illustration";
import { parseMechanismSpec } from "@/contracts/mechanism-spec";
import { ensureChartsDir, resolveChartFile } from "@/lib/charts-dir";
import { getErrorMessage } from "@/lib/error-utils";
import {
  arkImagesUrl,
  resolveIllustrationRuntime,
  ZHIPU_IMAGES_URL,
} from "@/lib/illustration-keys";
import {
  compileIllustrationPrompt,
  compileIllustrationPromptFromFigureSpecEnc,
  compileIllustrationPromptFromParts,
} from "@/lib/illustration-prompt";

const MAX_CANDIDATES = 2;

export interface RunIllustrationInput {
  sourceImageUrl: string;
  caption?: string;
  claim?: string;
  mechanismSpec?: unknown;
  figureSpecEnc?: string;
  promptOverride?: string;
  visibleText?: string[];
}

function chartFileFromUrl(url: string): string | null {
  const m = url.trim().match(/^\/api\/charts\/([A-Za-z0-9._-]+)$/);
  return m?.[1] ?? null;
}

function toDataUriPng(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function loadLocalChartPng(imageUrl: string): Buffer {
  const name = chartFileFromUrl(imageUrl);
  if (!name) {
    throw new Error("sourceImageUrl 必须是本站 /api/charts/ 下的结构图");
  }
  const file = resolveChartFile(name);
  if (!fs.existsSync(file)) {
    throw new Error(`结构图文件不存在：${name}`);
  }
  return fs.readFileSync(file);
}

export function persistIllustrationPng(buffer: Buffer): string {
  const fileName = `${randomUUID()}.png`;
  fs.writeFileSync(path.join(ensureChartsDir(), fileName), buffer);
  return `/api/charts/${fileName}`;
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`下载生成图失败 HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function urlsFromImagePayload(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const urls: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.url === "string" && rec.url.startsWith("http")) urls.push(rec.url);
    if (typeof rec.b64_json === "string" && rec.b64_json) {
      urls.push(`data:image/png;base64,${rec.b64_json}`);
    }
  }
  return urls;
}

async function persistRemoteOrDataUri(
  url: string,
  provider: IllustrationProvider,
  model: string,
): Promise<IllustrationCandidate> {
  let buf: Buffer;
  if (url.startsWith("data:image/")) {
    const b64 = url.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    buf = Buffer.from(b64, "base64");
  } else {
    buf = await downloadImage(url);
  }
  return {
    imageUrl: persistIllustrationPng(buf),
    provider,
    model,
  };
}

async function callJsonApi(opts: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(opts.body),
      signal: AbortSignal.timeout(90_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        json && typeof json === "object"
          ? JSON.stringify(json).slice(0, 400)
          : `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

export function buildIllustrationPrompt(input: RunIllustrationInput): IllustrationPromptV1 {
  const parsed = parseMechanismSpec(input.mechanismSpec);
  if (parsed) return compileIllustrationPrompt(parsed);
  const fromSpec = compileIllustrationPromptFromFigureSpecEnc(
    input.figureSpecEnc,
    input.caption ?? "",
  );
  if (fromSpec) {
    if (input.promptOverride?.trim()) {
      return { ...fromSpec, prompt: input.promptOverride.trim() };
    }
    return fromSpec;
  }
  const compiled = compileIllustrationPromptFromParts({
    claim: input.claim ?? "",
    caption: input.caption ?? "",
    visibleText: input.visibleText ?? [],
  });
  if (input.promptOverride?.trim()) {
    return { ...compiled, prompt: input.promptOverride.trim() };
  }
  return compiled;
}

async function runSeedream(input: {
  prompt: IllustrationPromptV1;
  png: Buffer;
  model: string;
  apiKey: string;
  imagesUrl: string;
}): Promise<IllustrationCandidate[]> {
  const image = toDataUriPng(input.png);
  const baseBody = {
    model: input.model,
    prompt: input.prompt.prompt,
    image,
    size: "2K",
    watermark: false,
    response_format: "url",
  };
  const withSeq = {
    ...baseBody,
    sequential_image_generation: "auto",
    sequential_image_generation_options: { max_images: MAX_CANDIDATES },
  };

  let called = await callJsonApi({
    url: input.imagesUrl,
    apiKey: input.apiKey,
    body: withSeq,
  });
  if (!called.ok) {
    called = await callJsonApi({
      url: input.imagesUrl,
      apiKey: input.apiKey,
      body: baseBody,
    });
  }
  if (!called.ok) {
    throw new Error(`即梦 Seedream 失败：${called.error}`);
  }
  const urls = urlsFromImagePayload(called.json).slice(0, MAX_CANDIDATES);
  if (!urls.length) {
    throw new Error("即梦 Seedream 未返回图片 URL");
  }
  const out: IllustrationCandidate[] = [];
  for (const url of urls) {
    out.push(await persistRemoteOrDataUri(url, "seedream", input.model));
  }
  return out;
}

async function runZhipu(input: {
  prompt: IllustrationPromptV1;
  model: string;
  apiKey: string;
}): Promise<IllustrationCandidate[]> {
  const called = await callJsonApi({
    url: ZHIPU_IMAGES_URL,
    apiKey: input.apiKey,
    body: {
      model: input.model,
      prompt: `${input.prompt.prompt}\nNegative: ${input.prompt.negativePrompt}`,
      size: "1440x1440",
    },
  });
  if (!called.ok) {
    throw new Error(`智谱文生图失败：${called.error}`);
  }
  const urls = urlsFromImagePayload(called.json).slice(0, MAX_CANDIDATES);
  if (!urls.length) {
    throw new Error("智谱文生图未返回图片 URL");
  }
  const out: IllustrationCandidate[] = [];
  for (const url of urls) {
    out.push(await persistRemoteOrDataUri(url, "zhipu", input.model));
  }
  return out;
}

export async function runMechanismIllustration(
  input: RunIllustrationInput,
): Promise<IllustrationRunResult> {
  const prompt = buildIllustrationPrompt(input);
  const png = loadLocalChartPng(input.sourceImageUrl);
  const runtime = await resolveIllustrationRuntime();

  if (runtime.arkKey) {
    try {
      const candidates = await runSeedream({
        prompt,
        png,
        model: runtime.seedreamModel,
        apiKey: runtime.arkKey,
        imagesUrl: arkImagesUrl(runtime.arkBaseUrl),
      });
      return {
        prompt,
        candidates,
        providerUsed: "seedream",
        fallback: false,
        sourceImageUrl: input.sourceImageUrl,
      };
    } catch (err) {
      if (!runtime.zhipuKey) throw err;
    }
  }

  if (!runtime.zhipuKey) {
    throw new Error(
      "未配置即梦 Key（VOLC_ARK_API_KEY）也未配置智谱 Key（ZHIPU_API_KEY）。请在 Admin 设置或 .env 填写。",
    );
  }

  const candidates = await runZhipu({
    prompt,
    model: runtime.zhipuImageModel,
    apiKey: runtime.zhipuKey,
  });
  return {
    prompt,
    candidates,
    providerUsed: "zhipu",
    fallback: Boolean(runtime.arkKey),
    sourceImageUrl: input.sourceImageUrl,
  };
}
