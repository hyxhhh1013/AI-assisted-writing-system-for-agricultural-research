# Agent 对话框文件上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Agent 对话框支持多格式文件上传（PDF/Word/图片/CSV·Excel/TXT·MD·LaTeX），默认会话级、可"固定到项目"，Agent 经 `read_attachment` / `list_attachments` 按需读取。

**Architecture:** 新增 `AgentAttachment` 表 + 私有磁盘存储 + `POST /api/agent/attachments` 上传/提取 API；文本提取层按格式分派（`pdf-parse` / `papaparse` / `xlsx` / `mammoth` / fs / GLM-4V 视觉）；两个只读工具接入现有 LangGraph ReAct；goal 首条消息注入附件清单；会话快照携带 attachmentIds；"固定到项目"API 复用同一条读链路。

**Tech Stack:** Next.js App Router · Prisma/PostgreSQL · pdf-parse · papaparse · xlsx · mammoth（新增）· Zhipu GLM-4V（新增 vision provider）· vitest。

**依据 spec：** `docs/superpowers/specs/2026-08-02-agent-file-upload-design.md`

---

## 文件结构（先定边界）

| 文件 | 职责 |
|------|------|
| `prisma/schema.prisma` | 新增 `AgentAttachment` 模型 + `AttachmentStatus` 枚举 |
| `src/contracts/agent-attachment.ts`（新建） | 前后端共享附件类型 `AgentAttachmentInfo` |
| `src/lib/agent/attachments/constants.ts`（新建） | 大小上限、扩展名白名单、截断上限、目录常量 |
| `src/lib/agent/attachments/storage.ts`（新建） | 落盘/读盘/净化文件名（复用 `safe-path.ts` + `runtime-paths.ts`） |
| `src/lib/agent/attachments/extract.ts`（新建） | 按格式提取文本 → `ExtractResult` |
| `src/lib/agent/attachments/describe-image.ts`（新建） | 图片 → GLM-4V 结构化描述（复用 `callAI`） |
| `src/lib/agent/attachments/manifest.ts`（新建） | `buildAttachmentManifest()` 纯函数 |
| `src/lib/agent/attachments/service.ts`（新建） | create / pin / getByUser 业务编排 |
| `src/app/api/agent/attachments/route.ts`（新建） | `POST` multipart 上传 |
| `src/app/api/agent/attachments/[id]/pin/route.ts`（新建） | `POST` 固定到项目 |
| `src/lib/agent/tools/read-attachment.ts`（新建） | Agent 工具 |
| `src/lib/agent/tools/list-attachments.ts`（新建） | Agent 工具 |
| `src/lib/agent/agent-loop.ts` | `createAgentTools()` 注册两个新工具 |
| `src/contracts/agent.ts` | `AgentRequest` 加 `attachmentIds?` |
| `src/contracts/agent-session.ts` | `AgentSessionSnapshot` 加 `attachmentIds?` |
| `src/lib/validations.ts` | `agentSchema` 加 `attachmentIds` |
| `src/lib/agent/langgraph/run-graph.ts` | 首条消息注入清单；快照携带 attachmentIds |
| `src/lib/agent/session-snapshot.ts` | `graphStateToSnapshot` 支持 attachmentIds |
| `src/hooks/use-agent.ts` | `sendGoal(goal, opts?)` 传 attachmentIds |
| `src/components/shared/agent/agent-input.tsx` | 附件按钮 + 拖拽 + chip + 上传 |
| `src/lib/agent/observation-memory.ts` | 无改动（工具结果走通用格式化） |

---

## Task 1: Prisma 模型 + 迁移

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration（`npx prisma migrate dev`）

- [ ] **Step 1: 在 schema.prisma 末尾（AgentSession 后）追加模型**

```prisma
// Agent 会话附件（W3-FILE-UPLOAD：上传 → 提取 → read_attachment）
model AgentAttachment {
  id            String           @id @default(cuid())
  userId        String
  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId     String?          // 会话级归属
  projectId     String?          // "固定到项目"后填写
  pinned        Boolean          @default(false)
  fileKey       String           // data/attachments/{userId}/{id}/{safeName} 相对路径
  originalName  String
  mimeType      String
  size          Int
  status        AttachmentStatus @default(extracting)
  extractSource String?          // pdf | docx | csv | excel | text | image_vision | image_ocr | failed
  extractedText String?          // read_attachment 返回内容（按 MAX_ATTACHMENT_TEXT_CHARS 截断）
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@index([userId, sessionId])
  @@index([userId, projectId])
  @@index([status])
}

enum AttachmentStatus {
  extracting
  ready
  extract_failed
  unsupported
}
```

- [ ] **Step 2: 生成迁移并验证 schema**

Run:
```bash
npx prisma migrate dev --name add_agent_attachment
```
Expected: migration 创建成功；`prisma/schema.prisma` 末尾出现 `model AgentAttachment`。若已有 `backup_*` 表注意不误删（本命令只加表）。

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(agent): AgentAttachment 模型与迁移"
```

---

## Task 2: 附件常量 + 共享类型 + 存储层

**Files:**
- Create: `src/contracts/agent-attachment.ts`
- Create: `src/lib/agent/attachments/constants.ts`
- Create: `src/lib/agent/attachments/storage.ts`
- Test: `src/__tests__/lib/agent-attachments-storage.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { sanitizeAttachmentName, writeAttachmentFile, readAttachmentFile, deleteAttachmentFile } from "@/lib/agent/attachments/storage";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import fs from "fs";
import path from "path";

describe("attachment storage", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeAttachmentName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeAttachmentName("报告(1).pdf")).toBe("报告(1).pdf");
    expect(sanitizeAttachmentName("a\\b\\c.md")).toBe("c.md");
  });

  it("writes and reads back a file under the per-attachment dir", () => {
    const fileKey = writeAttachmentFile("u1", "att1", "报告.pdf", Buffer.from("hello"));
    expect(fileKey).toContain("att1");
    const abs = resolveProjectRuntimePath(fileKey);
    expect(fs.existsSync(abs)).toBe(true);
    expect(readAttachmentFile("u1", "att1").toString("utf8")).toBe("hello");
  });

  it("deleteAttachmentFile removes the dir", () => {
    writeAttachmentFile("u1", "att2", "a.txt", Buffer.from("x"));
    deleteAttachmentFile("u1", "att2");
    expect(fs.existsSync(resolveProjectRuntimePath("data", "attachments", "u1", "att2"))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-storage.test.ts`
Expected: FAIL（模块不存在 / 函数未定义）。

- [ ] **Step 3: 实现 constants.ts**

```ts
export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
/** 提取文本入库上限（超过截断并标记 truncated） */
export const MAX_ATTACHMENT_TEXT_CHARS = 500_000;
/** read_attachment 单次默认/最大返回字符 */
export const READ_ATTACHMENT_DEFAULT_CHARS = 3_000;
export const READ_ATTACHMENT_MAX_CHARS = 8_000;
export const ATTACHMENT_ROOT = "data/attachments";
/** 允许的扩展名（小写，不含点） */
export const ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  "pdf", "docx", "txt", "md", "tex", "ris", "bib",
  "csv", "xlsx", "xls",
  "png", "jpg", "jpeg", "webp", "gif",
]);
export const ATTACHMENT_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
```

- [ ] **Step 4: 实现共享类型 `src/contracts/agent-attachment.ts`**

```ts
export type AttachmentExtractSource =
  | "pdf" | "docx" | "csv" | "excel" | "text"
  | "image_vision" | "image_ocr" | "failed";

export type AttachmentStatus =
  | "extracting" | "ready" | "extract_failed" | "unsupported";

/** 前后端共享的附件摘要（不含 extractedText 全文） */
export interface AgentAttachmentInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: AttachmentStatus;
  extractSource?: AttachmentExtractSource | null;
  charCount?: number;
  truncated?: boolean;
  pinned: boolean;
  createdAt: string;
}
```

- [ ] **Step 5: 实现 storage.ts**

```ts
import fs from "fs";
import path from "path";
import { assertSafePathSegment } from "@/lib/safe-path";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import { ATTACHMENT_ROOT } from "@/lib/agent/attachments/constants";

/** 净化文件名：去掉目录段与控制字符，保扩展名，截断 128 字符 */
export function sanitizeAttachmentName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\0-\x1f]/g, "");
  const cleaned = base.length > 128 ? `${base.slice(0, 128 - 8)}${base.slice(-8)}` : base;
  return cleaned.trim() || "file";
}

export function attachmentDir(userId: string, attachmentId: string): string {
  assertSafePathSegment(userId, "userId");
  assertSafePathSegment(attachmentId, "attachmentId");
  return path.join(ATTACHMENT_ROOT, userId, attachmentId);
}

/** 写文件，返回 fileKey（相对路径，供 DB 存） */
export function writeAttachmentFile(
  userId: string,
  attachmentId: string,
  originalName: string,
  data: Buffer,
): string {
  const dirRel = attachmentDir(userId, attachmentId);
  const dirAbs = resolveProjectRuntimePath(dirRel);
  fs.mkdirSync(dirAbs, { recursive: true });
  const safeName = sanitizeAttachmentName(originalName);
  const fileKey = path.posix.join(dirRel, safeName);
  fs.writeFileSync(resolveProjectRuntimePath(fileKey), data);
  return fileKey;
}

export function readAttachmentFile(userId: string, attachmentId: string): Buffer {
  const dirAbs = resolveProjectRuntimePath(attachmentDir(userId, attachmentId));
  const entries = fs.readdirSync(dirAbs);
  if (entries.length === 0) throw new Error("附件文件缺失");
  return fs.readFileSync(path.join(dirAbs, entries[0]));
}

export function deleteAttachmentFile(userId: string, attachmentId: string): void {
  const dirAbs = resolveProjectRuntimePath(attachmentDir(userId, attachmentId));
  fs.rmSync(dirAbs, { recursive: true, force: true });
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-attachments-storage.test.ts`
Expected: PASS。

- [ ] **Step 7: .gitignore 加附件目录**

Modify `.gitignore`，追加一行：`data/attachments/`

- [ ] **Step 8: 提交**

```bash
git add src/contracts/agent-attachment.ts src/lib/agent/attachments src/__tests__/lib/agent-attachments-storage.test.ts .gitignore
git commit -m "feat(agent): 附件常量/类型/存储层 (W3-FILE-UPLOAD)"
```

---

## Task 3: 文本提取层 extract.ts

**Files:**
- Create: `src/lib/agent/attachments/extract.ts`
- Test: `src/__tests__/lib/agent-attachments-extract.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";

function tmpFile(name: string, content: Buffer | string): string {
  const p = path.join(os.tmpdir(), `att-extract-${Date.now()}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

describe("extractAttachmentText", () => {
  it("extracts plain text files", async () => {
    const r = await extractAttachmentText(tmpFile("a.md", "# 标题\n内容"), "a.md");
    expect(r.status).toBe("ready");
    expect(r.text).toContain("标题");
    expect(r.source).toBe("text");
  });

  it("converts CSV to markdown table", async () => {
    const r = await extractAttachmentText(tmpFile("d.csv", "a,b\n1,2\n3,4"), "d.csv");
    expect(r.status).toBe("ready");
    expect(r.text).toContain("| a | b |");
    expect(r.text).toContain("| 1 | 2 |");
    expect(r.source).toBe("csv");
  });

  it("marks unsupported extensions", async () => {
    const r = await extractAttachmentText(tmpFile("x.exe", "MZ"), "x.exe");
    expect(r.status).toBe("unsupported");
  });

  it("truncates over-long text and marks truncated", async () => {
    const big = "x".repeat(600_000);
    const r = await extractAttachmentText(tmpFile("big.txt", big), "big.txt");
    expect(r.status).toBe("ready");
    expect(r.truncated).toBe(true);
    expect((r.text?.length ?? 0)).toBeLessThan(500_001);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-extract.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 extract.ts**

```ts
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import papa from "papaparse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { describeImage } from "@/lib/agent/attachments/describe-image";
import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_IMAGE_EXTENSIONS,
  MAX_ATTACHMENT_TEXT_CHARS,
} from "@/lib/agent/attachments/constants";
import type { AttachmentExtractSource } from "@/contracts/agent-attachment";

export interface ExtractResult {
  status: "ready" | "extract_failed" | "unsupported";
  text?: string;
  charCount?: number;
  truncated?: boolean;
  source: AttachmentExtractSource;
  error?: string;
}

function extOf(filePath: string): string {
  return path.extname(filePath).toLowerCase().replace(/^\./, "");
}

function truncateTo(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_ATTACHMENT_TEXT_CHARS) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, MAX_ATTACHMENT_TEXT_CHARS), truncated: true };
}

/** CSV / Excel → Markdown 表格 */
function toMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return "";
  const header = rows[0].map((c) => String(c ?? ""));
  const body = rows.slice(1);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
  const headLine = `| ${header.map(esc).join(" | ")} |`;
  const sepLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = body
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .slice(0, 500)
    .map((r) => `| ${r.map((c) => esc(String(c ?? ""))).join(" | ")} |`);
  return [headLine, sepLine, ...bodyLines].join("\n");
}

export async function extractAttachmentText(
  filePath: string,
  originalName: string,
): Promise<ExtractResult> {
  const ext = extOf(originalName || filePath);
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(ext)) {
    return { status: "unsupported", source: "failed" };
  }
  try {
    if (ext === "txt" || ext === "md" || ext === "tex" || ext === "ris" || ext === "bib") {
      const text = fs.readFileSync(filePath, "utf8");
      return { status: "ready", ...truncateTo(text), source: "text" };
    }
    if (ext === "csv") {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = papa.parse<string[]>(raw, { skipEmptyLines: true }) as {
        data: string[][];
      };
      const text = toMarkdownTable(parsed.data);
      return { status: "ready", ...truncateTo(text || "(空表格)"), source: "csv" };
    }
    if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.readFile(filePath);
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames.slice(0, 5)) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
        parts.push(`### ${sheetName}\n${toMarkdownTable(rows)}`);
      }
      return { status: "ready", ...truncateTo(parts.join("\n\n") || "(空表格)"), source: "excel" };
    }
    if (ext === "pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      const text = (data.text ?? "").replace(/\n{3,}/g, "\n\n");
      return { status: "ready", ...truncateTo(text.trim() || "(PDF 无文本层)"), source: "pdf" };
    }
    if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      return { status: "ready", ...truncateTo(result.value.trim()), source: "docx" };
    }
    if (ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) {
      return await describeImage(filePath);
    }
    return { status: "unsupported", source: "failed" };
  } catch (err) {
    return {
      status: "extract_failed",
      source: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 4: 占位 describeImage（Task 7 前先返回失败）**

`src/lib/agent/attachments/describe-image.ts`：

```ts
/** 图片 → 文本。Task 7 前为占位：直接失败（视觉 provider 未接）。 */
export async function describeImage(
  _filePath: string,
): Promise<{ status: "ready" | "extract_failed"; text?: string; truncated?: boolean; source: "image_vision" | "image_ocr"; error?: string }> {
  return { status: "extract_failed", source: "image_ocr", error: "视觉模型未配置" };
}
```

- [ ] **Step 5: 加 mammoth 依赖**

Run: `npm install mammoth`
Expected: package.json 出现 `mammoth`。

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-attachments-extract.test.ts`
Expected: PASS（图片测试会走占位分支；本文件未断言图片）。

- [ ] **Step 7: 提交**

```bash
git add src/lib/agent/attachments/extract.ts src/lib/agent/attachments/describe-image.ts src/__tests__/lib/agent-attachments-extract.test.ts package.json package-lock.json
git commit -m "feat(agent): 附件文本提取层 (pdf/csv/xlsx/txt/docx)"
```

---

## Task 4: 上传 service + API 路由

**Files:**
- Create: `src/lib/agent/attachments/service.ts`
- Create: `src/app/api/agent/attachments/route.ts`
- Test: `src/__tests__/lib/agent-attachments-service.test.ts`

- [ ] **Step 1: 写失败测试（service）**

```ts
import { describe, expect, it, vi } from "vitest";
import type { File as NodeFile } from "buffer";
import { createAttachmentFromFile } from "@/lib/agent/attachments/service";
import prisma from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({ default: { agentAttachment: { create: vi.fn(), findFirst: vi.fn() } } }));

function fakeFile(name: string, content: string, mime = "text/plain"): NodeFile {
  return new File([content], name, { type: mime }) as unknown as NodeFile;
}

describe("createAttachmentFromFile", () => {
  it("rejects oversize files", async () => {
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("big.pdf", "x".repeat(21 * 1024 * 1024))),
    ).rejects.toThrow(/过大/);
  });

  it("rejects disallowed extension", async () => {
    await expect(
      createAttachmentFromFile("u1", "s1", fakeFile("evil.exe", "MZ")),
    ).rejects.toThrow(/不支持/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-service.test.ts`
Expected: FAIL（service 不存在）。

- [ ] **Step 3: 实现 service.ts**

```ts
import { randomUUID } from "crypto";
import { ATTACHMENT_ALLOWED_EXTENSIONS, MAX_ATTACHMENT_BYTES } from "@/lib/agent/attachments/constants";
import { extractAttachmentText } from "@/lib/agent/attachments/extract";
import { deleteAttachmentFile, readAttachmentFile, writeAttachmentFile } from "@/lib/agent/attachments/storage";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import prisma from "@/lib/prisma";
import type { AgentAttachmentInfo, AttachmentExtractSource } from "@/contracts/agent-attachment";

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export function assertAttachmentAcceptable(file: { name: string; size: number }): void {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`文件过大（上限 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB）`);
  }
  if (!ATTACHMENT_ALLOWED_EXTENSIONS.has(extOf(file.name))) {
    throw new Error(`不支持的文件类型：${file.name}（允许 ${[...ATTACHMENT_ALLOWED_EXTENSIONS].join("/")}）`);
  }
}

export async function createAttachmentFromFile(
  userId: string,
  sessionId: string | undefined,
  file: File,
): Promise<AgentAttachmentInfo> {
  assertAttachmentAcceptable(file);
  const attachmentId = randomUUID();
  const buf = Buffer.from(await file.arrayBuffer());
  // 一次落盘拿到 fileKey，再交给提取层（fileKey 即相对路径，DB 只存它）
  const fileKey = writeAttachmentFile(userId, attachmentId, file.name, buf);

  let status: AgentAttachmentInfo["status"] = "ready";
  let extractedText: string | null = null;
  let extractSource: AttachmentExtractSource | null = null;
  let truncated = false;
  let charCount = 0;
  try {
    const result = await extractAttachmentText(
      resolveProjectRuntimePath(fileKey),
      file.name,
    );
    if (result.status === "ready") {
      extractedText = result.text ?? null;
      charCount = result.charCount ?? (result.text?.length ?? 0);
      truncated = result.truncated ?? false;
      extractSource = result.source;
    } else {
      status = result.status === "unsupported" ? "unsupported" : "extract_failed";
      extractSource = result.source;
    }
  } catch {
    status = "extract_failed";
    extractSource = "failed";
  }

  const row = await prisma.agentAttachment.create({
    data: {
      id: attachmentId,
      userId,
      sessionId: sessionId ?? null,
      fileKey,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buf.length,
      status,
      extractSource,
      extractedText,
    },
  });
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status,
    extractSource: row.extractSource as AttachmentExtractSource | null,
    charCount,
    truncated,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function pinAttachment(
  userId: string,
  attachmentId: string,
  projectId: string,
): Promise<AgentAttachmentInfo | null> {
  const row = await prisma.agentAttachment.updateMany({
    where: { id: attachmentId, userId },
    data: { projectId, pinned: true },
  });
  if (row.count === 0) return null;
  const updated = await prisma.agentAttachment.findUnique({ where: { id: attachmentId } });
  if (!updated) return null;
  return {
    id: updated.id,
    originalName: updated.originalName,
    mimeType: updated.mimeType,
    size: updated.size,
    status: updated.status,
    extractSource: updated.extractSource as AttachmentExtractSource | null,
    pinned: updated.pinned,
    createdAt: updated.createdAt.toISOString(),
  };
}

export { deleteAttachmentFile, readAttachmentFile };
```

> 注：上面 extract 时调了两次 `writeAttachmentFile`（写同路径同内容，幂等）——为消除冗余，实现时应改为先落盘一次拿到 fileKey，再传 fileKey 给 extract。请直接按"落盘一次"实现，避免重复写。

- [ ] **Step 4: 跑 service 测试确认通过（mock prisma 下）**

Run: `npx vitest run src/__tests__/lib/agent-attachments-service.test.ts`
Expected: PASS。

- [ ] **Step 5: 实现上传路由 `src/app/api/agent/attachments/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-utils";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { createAttachmentFromFile, deleteAttachmentFile } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAgentEnabled()) {
    return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  }
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传文件（字段名 file）" }, { status: 400 });
    }
    const sessionIdRaw = formData.get("sessionId");
    const sessionId =
      typeof sessionIdRaw === "string" && sessionIdRaw.trim() ? sessionIdRaw.trim() : undefined;

    const attachment = await createAttachmentFromFile(userId, sessionId, file);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || "上传失败" }, { status: 400 });
  }
}
```

- [ ] **Step 6: 提交**

```bash
git add src/lib/agent/attachments/service.ts src/app/api/agent/attachments/route.ts src/__tests__/lib/agent-attachments-service.test.ts
git commit -m "feat(agent): 附件上传 service + API"
```

---

## Task 5: read_attachment / list_attachments 工具

**Files:**
- Create: `src/lib/agent/tools/read-attachment.ts`
- Create: `src/lib/agent/tools/list-attachments.ts`
- Modify: `src/lib/agent/agent-loop.ts`
- Test: `src/__tests__/lib/agent-attachment-tools.test.ts`

- [ ] **Step 1: 写失败测试（read_attachment 分页与归属）**

```ts
import { describe, expect, it } from "vitest";
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
import prisma from "@/lib/prisma";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/prisma", () => ({ default: { agentAttachment: { findFirst: vi.fn() } } }));

function ctx(userId = "u1", sessionId = "s1"): AgentContext {
  return {
    userId,
    sessionId,
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

describe("readAttachmentTool", () => {
  it("returns a window with offset pagination", async () => {
    (prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1", userId: "u1", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", extractedText: "一二三四五六七八九",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1", offset: 2, maxChars: 4 }, ctx());
    expect(r.success).toBe(true);
    expect((r.data as { text: string }).text).toBe("三四");
  });

  it("rejects attachment owned by another user", async () => {
    (prisma.agentAttachment.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1", userId: "other", sessionId: "s1", projectId: null, pinned: false,
      status: "ready", extractedText: "x",
    });
    const r = await readAttachmentTool.execute({ fileId: "a1" }, ctx());
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachment-tools.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 read-attachment.ts**

```ts
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";
import { READ_ATTACHMENT_DEFAULT_CHARS, READ_ATTACHMENT_MAX_CHARS } from "@/lib/agent/attachments/constants";

export const readAttachmentTool: ToolDefinition = {
  name: "read_attachment",
  description:
    "读取本会话已上传附件的内容。长文本分页：part=\"head\"|\"tail\"，或用 offset（字符起点）+ maxChars。"
    + "读图/读数据文件同样用本工具（已提取为文本/表格）。",
  parameters: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "附件 id（来自 goal 里的附件清单或 list_attachments）" },
      part: { type: "string", enum: ["head", "tail"], description: "读开头/结尾（二选一，默认 head）" },
      offset: { type: "number", description: "字符起点（与 part 二选一）" },
      maxChars: { type: "number", description: `返回最大字符数（默认 ${READ_ATTACHMENT_DEFAULT_CHARS}，上限 ${READ_ATTACHMENT_MAX_CHARS}）` },
    },
    required: ["fileId"],
  },
  safety: "read",
  async execute(params, ctx: AgentContext) {
    const fileId = String(params.fileId ?? "").trim();
    if (!fileId) return { success: false, error: "缺少 fileId" };

    const row = await prisma.agentAttachment.findFirst({
      where: { id: fileId, userId: ctx.userId },
    });
    if (!row) return { success: false, error: "附件不存在或无权访问" };
    // 归属：会话级须匹配当前会话；已 pin 转项目级则校验 projectId
    const sessionOk = row.sessionId == null || row.sessionId === ctx.sessionId;
    const projectOk = !row.pinned || (ctx.projectId != null && row.projectId === ctx.projectId);
    if (!sessionOk || !projectOk) {
      return { success: false, error: "该附件不属于当前会话/项目" };
    }

    if (row.status === "extracting") {
      return { success: false, error: "附件仍在提取中，请稍后重试" };
    }
    if (row.status !== "ready" || !row.extractedText) {
      return { success: false, error: "附件未能提取内容，仅可查看文件名/预览" };
    }

    const text = row.extractedText;
    const maxChars = Math.min(
      typeof params.maxChars === "number" && params.maxChars > 0 ? Math.floor(params.maxChars) : READ_ATTACHMENT_DEFAULT_CHARS,
      READ_ATTACHMENT_MAX_CHARS,
    );
    const part = params.part === "tail" ? "tail" : "head";
    let start = 0;
    if (params.offset != null && typeof params.offset === "number" && params.offset > 0) {
      start = Math.floor(params.offset);
    } else if (part === "tail") {
      start = Math.max(0, text.length - maxChars);
    }
    const window = text.slice(start, start + maxChars);
    const hasMore = start + maxChars < text.length;
    return {
      success: true,
      summary: `已读取 ${row.originalName}（${window.length} 字符${hasMore ? "，还有更多" : ""}）`,
      data: {
        text: window,
        offset: start,
        hasMore,
        totalChars: text.length,
        truncated: row.status === "ready" && window.length < text.length,
      },
    };
  },
};
```

- [ ] **Step 4: 实现 list-attachments.ts**

```ts
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

export const listAttachmentsTool: ToolDefinition = {
  name: "list_attachments",
  description: "列出本会话（或已 pin 到当前项目）的附件：id/文件名/类型/字数/提取状态。",
  parameters: { type: "object", properties: {}, required: [] },
  safety: "read",
  async execute(_params, ctx: AgentContext) {
    const rows = await prisma.agentAttachment.findMany({
      where: {
        userId: ctx.userId,
        OR: [
          ...(ctx.sessionId ? [{ sessionId: ctx.sessionId }] : []),
          ...(ctx.projectId ? [{ pinned: true, projectId: ctx.projectId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return {
      success: true,
      summary: rows.length === 0 ? "当前无附件" : `共 ${rows.length} 个附件`,
      data: {
        attachments: rows.map((r) => ({
          id: r.id,
          name: r.originalName,
          status: r.status,
          source: r.extractSource,
          chars: r.extractedText?.length ?? 0,
          pinned: r.pinned,
        })),
      },
    };
  },
};
```

- [ ] **Step 5: 注册工具到 `src/lib/agent/agent-loop.ts`**

在 `createReadOnlyTools()` 数组开头（`inspectProjectTool` 前）加两行 import 与两项：

```ts
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
import { listAttachmentsTool } from "@/lib/agent/tools/list-attachments";
// createReadOnlyTools 返回数组首行插入：
//   readAttachmentTool,
//   listAttachmentsTool,
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-attachment-tools.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/agent/tools/read-attachment.ts src/lib/agent/tools/list-attachments.ts src/lib/agent/agent-loop.ts src/__tests__/lib/agent-attachment-tools.test.ts
git commit -m "feat(agent): read_attachment / list_attachments 工具"
```

---

## Task 6: 附件清单注入 + agent 路由接线 + 快照

**Files:**
- Create: `src/lib/agent/attachments/manifest.ts`
- Modify: `src/contracts/agent.ts`、`src/contracts/agent-session.ts`、`src/lib/validations.ts`
- Modify: `src/app/api/agent/route.ts`、`src/lib/agent/langgraph/run-graph.ts`、`src/lib/agent/session-snapshot.ts`
- Test: `src/__tests__/lib/agent-attachments-manifest.test.ts`

- [ ] **Step 1: 写失败测试（manifest 纯函数）**

```ts
import { describe, expect, it } from "vitest";
import { buildAttachmentManifest } from "@/lib/agent/attachments/manifest";
import type { AgentAttachmentInfo } from "@/contracts/agent-attachment";

describe("buildAttachmentManifest", () => {
  it("lists ready attachments with usage hint", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a1", originalName: "report.pdf", mimeType: "application/pdf",
      size: 1000, status: "ready", extractSource: "pdf", charCount: 3200, truncated: false,
      pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    const text = buildAttachmentManifest(info);
    expect(text).toContain("report.pdf");
    expect(text).toContain('read_attachment("a1")');
    expect(text).toContain("3200");
  });

  it("marks failed extraction", () => {
    const info: AgentAttachmentInfo[] = [{
      id: "a2", originalName: "图1.png", mimeType: "image/png",
      size: 500, status: "extract_failed", pinned: false, createdAt: "2026-08-02T00:00:00Z",
    }];
    expect(buildAttachmentManifest(info)).toContain("未提取成功");
  });

  it("empty returns empty string", () => {
    expect(buildAttachmentManifest([])).toBe("");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-manifest.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 manifest.ts**

```ts
import type { AgentAttachmentInfo } from "@/contracts/agent-attachment";

const STATUS_LABEL: Record<AgentAttachmentInfo["status"], string> = {
  extracting: "提取中",
  ready: "已提取",
  extract_failed: "未提取成功",
  unsupported: "不支持的类型",
};

/** 把附件清单拼成首条 user 消息前缀（state.goal 保持干净，不影响意图正则） */
export function buildAttachmentManifest(attachments: AgentAttachmentInfo[]): string {
  if (attachments.length === 0) return "";
  const lines = attachments.map((a) => {
    const status = a.status === "ready"
      ? `已提取（约 ${a.charCount ?? 0} 字${a.truncated ? "，已截断" : ""}）`
      : STATUS_LABEL[a.status];
    const hint =
      a.status === "ready"
        ? `可调用 read_attachment("${a.id}") 读取；长文本用 part="head"/"tail" 或 offset 分页。`
        : "该附件仅展示文件名，无法读取内容。";
    return `- ${a.originalName}（${status}）\n  → ${hint}`;
  });
  return `【附件】\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: 接线类型与校验**

`src/contracts/agent.ts` 的 `AgentRequest` 加：
```ts
  /** 本消息携带的附件 id（上传后从 /api/agent/attachments 获得） */
  attachmentIds?: string[];
```

`src/lib/validations.ts` 的 `agentSchema` 加：
```ts
    attachmentIds: z.array(z.string().min(1)).max(20).optional(),
```

`src/contracts/agent-session.ts` 的 `AgentSessionSnapshot` 加（`version` 保持 1，字段可选向后兼容）：
```ts
  /** 本会话附件 id（traceability；归属以 AgentAttachment.sessionId 为准） */
  attachmentIds?: string[];
```

`src/lib/agent/langgraph/run-graph.ts`：
- `AgentLoopOptions`（`src/lib/agent/types.ts`）加 `attachmentManifest?: string; attachmentIds?: string[];`
- `runAgentGraphLoop` 解构 `attachmentManifest`，在**非 resume** 初始 state 里拼进首条 user 消息：

```ts
  let initialState: Partial<AgentGraphStateType> = resumeState
    ? { ...resumeState, goal, events: [], finished: false, error: null,
        awaitingCheckpoint: null, awaitingConfirm: null, grantedConfirm: null,
        ...(followUp && diagnoseGoal ? { toolSummaries: [], observations: [] } : {}) }
    : {
        goal,
        messages: [
          { role: "user", content: mergeGoalWithIntentHint(goal) },
        ],
      };

  // 附件清单：非 resume 时拼进首条 user 消息（清单已在历史里则不重复注入）
  if (attachmentManifest && !resumeState && initialState.messages?.length) {
    const first = initialState.messages[0];
    initialState = {
      ...initialState,
      messages: [
        { ...first, content: `${attachmentManifest}\n\n${first.content}` },
        ...(initialState.messages?.slice(1) ?? []),
      ],
    };
  }
```

- `persist` 闭包调 `graphStateToSnapshot` 时传 `attachmentIds`（第三个可选参）：

`src/lib/agent/session-snapshot.ts`：
```ts
export function graphStateToSnapshot(
  state: AgentGraphStateType,
  uiTranscript?: AgentUiMessage[],
  workMemory?: AgentWorkMemory | null,
  attachmentIds?: string[],
): AgentSessionSnapshot {
  return {
    ...
    ...(attachmentIds && attachmentIds.length ? { attachmentIds } : {}),
  };
}
```
`run-graph.ts` 里 `persist` 内改为：`graphStateToSnapshot(state, uiTranscript, context.workMemory, options.attachmentIds)`。

- [ ] **Step 5: agent 路由加载附件并生成清单**

`src/app/api/agent/route.ts` 在 `goal` 处理附近：

```ts
    // 附件：加载并生成清单（失败不阻断对话）
    let attachmentManifest: string | undefined;
    const attachmentIds = data.attachmentIds ?? [];
    if (attachmentIds.length > 0) {
      try {
        const { buildAttachmentManifest } = await import("@/lib/agent/attachments/manifest");
        const { prisma } = await import("@/lib/prisma");
        const rows = await prisma.agentAttachment.findMany({
          where: { id: { in: attachmentIds }, userId },
        });
        const infos = rows.map((r) => ({
          id: r.id, originalName: r.originalName, mimeType: r.mimeType, size: r.size,
          status: r.status, extractSource: r.extractSource,
          charCount: r.extractedText?.length ?? 0,
          pinned: r.pinned, createdAt: r.createdAt.toISOString(),
        }));
        attachmentManifest = buildAttachmentManifest(infos);
      } catch { /* 清单失败仅降级，不阻断 */ }
    }
```

并把 `attachmentManifest`、`attachmentIds` 传给 `runAgentLoop`（经 `AgentLoopOptions`，最终到 `runAgentGraphLoop`）。

> 注：`route.ts` 顶部已 `import prisma from "@/lib/prisma"`，直接用；无需动态 import。

- [ ] **Step 6: 跑 manifest 测试 + 全量 agent 测试**

Run: `npx vitest run src/__tests__/lib/agent-attachments-manifest.test.ts src/__tests__/lib/agent-*.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/agent/attachments/manifest.ts src/contracts/agent.ts src/contracts/agent-session.ts src/lib/validations.ts src/lib/agent/types.ts src/app/api/agent/route.ts src/lib/agent/langgraph/run-graph.ts src/lib/agent/session-snapshot.ts src/__tests__/lib/agent-attachments-manifest.test.ts
git commit -m "feat(agent): 附件清单注入 + 请求/快照接线"
```

---

## Task 7: GLM-4V 视觉提取

**Files:**
- Modify: `src/lib/models.ts`
- Modify: `src/lib/agent/attachments/describe-image.ts`
- Modify: `src/lib/ai.ts`（仅确认 `AICallOptions.messages` 支持数组 content，通常无需改）
- Test: `src/__tests__/lib/agent-attachments-describe-image.test.ts`

- [ ] **Step 1: 写失败测试（mock callAI）**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { describeImage } from "@/lib/agent/attachments/describe-image";
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
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-describe-image.test.ts`
Expected: FAIL。

- [ ] **Step 3: models.ts 加 vision provider**

在 `MODEL_PROVIDERS` 里追加（复用 Zhipu 端点与 key，仅模型名不同）：

```ts
  vision: {
    name: "智谱视觉",
    model: process.env.ZHIPU_VISION_MODEL || "glm-4v",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKeyEnvVar: "ZHIPU_API_KEY",
    modelSettingKey: "ZHIPU_VISION_MODEL",
    getApiKey: () => process.env.ZHIPU_API_KEY,
    enabled: !!process.env.ZHIPU_API_KEY,
  },
```

> `ModelProviderKey` 由 `keyof typeof MODEL_PROVIDERS` 自动扩展为 `"deepseek" | "zhipu" | "vision"`；`callAI` 无需改动（`messages` 已是 JSON 直传，数组 content 的 `image_url` 由 Zhipu 解析）。

- [ ] **Step 4: 实现 describe-image.ts**

```ts
import fs from "fs";
import path from "path";
import { callAI } from "@/lib/ai";
import { MAX_ATTACHMENT_TEXT_CHARS } from "@/lib/agent/attachments/constants";

const IMAGE_PROMPT =
  "你是论文配图理解助手。请用中文输出固定结构：\n"
  + "类型：截图|表格|数据图|示意图|流程图\n"
  + "画面描述：≤3 句\n"
  + "文字内容：图中全部可读文字\n"
  + "数据与坐标轴：若有，列出轴名与关键数值，并用一句话说趋势\n"
  + "不要编造图中没有的信息。";

function mimeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif",
  };
  return map[ext] ?? "image/png";
}

/** 图片 → 结构化文本描述（GLM-4V）。无视觉 key 或失败降级 extract_failed。 */
export async function describeImage(
  filePath: string,
): Promise<{ status: "ready" | "extract_failed"; text?: string; truncated?: boolean; source: "image_vision" | "image_ocr"; error?: string }> {
  try {
    const data = fs.readFileSync(filePath).toString("base64");
    const response = await callAI({
      provider: "vision",
      messages: [
        { role: "system", content: IMAGE_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "请理解这张图片：" },
            { type: "image_url", image_url: { url: `data:${mimeOf(filePath)};base64,${data}` } },
          ],
        },
      ],
      stream: false,
      timeoutMs: 30_000,
    });
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return { status: "extract_failed", source: "image_ocr", error: "视觉模型未返回内容" };
    return {
      status: "ready",
      text: content.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      truncated: content.length > MAX_ATTACHMENT_TEXT_CHARS,
      source: "image_vision",
    };
  } catch (err) {
    return {
      status: "extract_failed",
      source: "image_ocr",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-attachments-describe-image.test.ts`
Expected: PASS（mock 下 provider 断言为 `vision`）。

- [ ] **Step 6: tsc + 全量 agent 测试**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/lib/agent-*.test.ts`
Expected: 均通过。

- [ ] **Step 7: 提交**

```bash
git add src/lib/models.ts src/lib/agent/attachments/describe-image.ts src/__tests__/lib/agent-attachments-describe-image.test.ts
git commit -m "feat(agent): GLM-4V 图片视觉提取 (vision provider)"
```

---

## Task 8: pin API

**Files:**
- Create: `src/app/api/agent/attachments/[id]/pin/route.ts`
- Test: `src/__tests__/lib/agent-attachments-pin.test.ts`

- [ ] **Step 1: 写失败测试（service.pinAttachment 归属）**

```ts
import { describe, expect, it, vi } from "vitest";
import { pinAttachment } from "@/lib/agent/attachments/service";
import prisma from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  default: {
    agentAttachment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: "a1", userId: "u1", originalName: "d.csv", mimeType: "text/csv",
        size: 10, status: "ready", extractSource: "csv", pinned: true,
        createdAt: new Date("2026-08-02"),
      }),
    },
  },
}));

describe("pinAttachment", () => {
  it("sets projectId and pinned", async () => {
    const r = await pinAttachment("u1", "a1", "p1");
    expect(r?.pinned).toBe(true);
    expect(prisma.agentAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a1", userId: "u1" },
    }));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-pin.test.ts`
Expected: FAIL（`pinAttachment` 未导出——Task 4 里已实现，需确认已导出；若已导出则此步直接 PASS）。

> 注：`pinAttachment` 已在 Task 4 实现并导出，本任务只需路由 + 测试，若测试直接 PASS 则跳过失败预期。

- [ ] **Step 3: 实现路由**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error-utils";
import { isAgentEnabled } from "@/lib/agent/core/safety";
import { pinAttachment } from "@/lib/agent/attachments/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentEnabled()) return NextResponse.json({ error: "Agent 功能未启用" }, { status: 503 });
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    const attachment = await pinAttachment(userId, id, projectId);
    if (!attachment) return NextResponse.json({ error: "附件不存在或无权访问" }, { status: 404 });
    return NextResponse.json({ attachment });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) || "固定失败" }, { status: 400 });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/__tests__/lib/agent-attachments-pin.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/agent/attachments/[id]/pin/route.ts src/__tests__/lib/agent-attachments-pin.test.ts
git commit -m "feat(agent): 附件固定到项目 pin API"
```

---

## Task 9: 前端 — useAgent + AgentInputBar 上传

**Files:**
- Modify: `src/services/agent.ts`、`src/hooks/use-agent.ts`
- Modify: `src/components/shared/agent/agent-input.tsx`、`src/components/shared/agent/agent-panel.tsx`
- Test: `src/__tests__/lib/agent-attachments-client.test.ts`（纯逻辑：扩展名过滤/文件大小提示）

- [ ] **Step 1: 写失败测试（前端过滤纯函数，放 lib 便于测试）**

先建 `src/lib/agent/attachments/client-validate.ts`：

```ts
export function clientRejectReason(file: { name: string; size: number }): string | null {
  if (file.size > 20 * 1024 * 1024) return "文件超过 20MB";
  const allowed = new Set(["pdf","docx","txt","md","tex","ris","bib","csv","xlsx","xls","png","jpg","jpeg","webp","gif"]);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowed.has(ext)) return "不支持的文件类型";
  return null;
}
```

测试：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/__tests__/lib/agent-attachments-client.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 client-validate.ts 并跑 PASS**

- [ ] **Step 4: `src/services/agent.ts` 加上传函数**

```ts
export async function postAgentAttachment(
  file: File,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<{ attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo }> {
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("sessionId", sessionId);
  const res = await fetch("/api/agent/attachments", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "上传失败");
  }
  return (await res.json()) as { attachment: import("@/contracts/agent-attachment").AgentAttachmentInfo };
}
```

- [ ] **Step 5: `useAgent` 的 `sendGoal` 支持附件**

`src/hooks/use-agent.ts`：

```ts
  const sendGoal = useCallback(
    async (goal: string, opts?: { attachmentIds?: string[] }) => {
      const trimmed = goal.trim();
      if (!trimmed) return;
      await runStream(
        {
          goal: trimmed,
          projectId: options.projectId,
          directionSlug: options.directionSlug,
          mode: "auto",
          ...(sessionId ? { sessionId } : {}),
          ...(opts?.attachmentIds?.length ? { attachmentIds: opts.attachmentIds } : {}),
        },
        trimmed,
      );
    },
    [runStream, options.projectId, options.directionSlug, sessionId],
  );
```

- [ ] **Step 6: `AgentInputBar` 加附件按钮 + 拖拽 + chip**

`agent-input.tsx` 改动要点（`"use client"` 组件）：

```tsx
import { Paperclip, X, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { clientRejectReason } from "@/lib/agent/attachments/client-validate";
import { postAgentAttachment } from "@/services/agent";

interface AgentAttachmentChip {
  file: File;
  attachmentId: string | null; // null = 上传中/失败
  status: "uploading" | "ready" | "failed";
  error?: string;
}

// 组件内新增 state：
//   const [chips, setChips] = useState<AgentAttachmentChip[]>([]);
//   const fileInputRef = useRef<HTMLInputElement>(null);

// 上传函数：
const uploadFile = async (file: File) => {
  const reject = clientRejectReason(file);
  if (reject) { toast.error(`${file.name}：${reject}`); return; }
  const chip: AgentAttachmentChip = { file, attachmentId: null, status: "uploading" };
  setChips((prev) => [...prev, chip]);
  try {
    const { attachment } = await postAgentAttachment(file, sessionId);
    setChips((prev) => prev.map((c) =>
      c.file === file ? { ...c, attachmentId: attachment.id, status: "ready" } : c,
    ));
  } catch (e) {
    setChips((prev) => prev.map((c) =>
      c.file === file ? { ...c, status: "failed", error: e instanceof Error ? e.message : "上传失败" } : c,
    ));
  }
};

// onSend 改为：
//   onSend(value, { attachmentIds: chips.filter(c => c.status === "ready" && c.attachmentId).map(c => c.attachmentId!) })
// 发送成功后清空 chips。

// JSX：输入框左侧加 Paperclip 按钮 + 隐藏 file input（accept 白名单多格式）；
// 输入框上方渲染 chips：文件名 + 状态图标（Loader2/Check/Alert）+ X 移除。
```

`agent-panel.tsx` 的 `AgentInputBar` 调用点同步（`onSend` 支持第二个参数，`disabled={!projectId}` 保持）；`AgentInputBar` props 增加 `sessionId?: string`（用于上传时携带）。

- [ ] **Step 7: 跑 client 测试 + tsc**

Run: `npx vitest run src/__tests__/lib/agent-attachments-client.test.ts && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/services/agent.ts src/hooks/use-agent.ts src/components/shared/agent/agent-input.tsx src/components/shared/agent/agent-panel.tsx src/lib/agent/attachments/client-validate.ts src/__tests__/lib/agent-attachments-client.test.ts
git commit -m "feat(agent): 对话框文件上传 UI (附件按钮/拖拽/chip)"
```

---

## Task 10: eval fixture + 全量验证

**Files:**
- Modify: `src/lib/eval/agent-scripts.ts` + `src/__tests__/eval/agent-scripts.eval.test.ts`
- Modify: `docs/ENGINEERING_OPTIMIZATION_QUEUE.md`（可选：登记进度）

- [ ] **Step 1: 加 eval fixture（读附件目标）**

在 `AGENT_SCRIPT_FIXTURES` 增加一条：

```ts
{
  fixtureId: "file-upload-read",
  trace: {
    scriptId: "FILE-READ",
    goals: ["读取上传的 report.pdf 并总结要点"],
    tools: [{ tool: "read_attachment", success: true }],
    finalText: "报告要点：…",
  },
  expectPass: true,
}
```

在 `src/lib/eval/agent-scripts.ts` 的脚本规则里注册 `FILE-READ`：首工具应为 `read_attachment` 或 `list_attachments`，最终文本引用附件名。

- [ ] **Step 2: 跑 eval 测试**

Run: `npx vitest run src/__tests__/eval/agent-scripts.eval.test.ts`
Expected: PASS（新增 fixture 被覆盖）。

- [ ] **Step 3: 全量验证**

Run:
```bash
npx tsc --noEmit
npx vitest run src/__tests__/lib/agent-*.test.ts
npx vitest run src/__tests__/eval/agent-scripts.eval.test.ts
npx eslint src/lib/agent/attachments src/lib/agent/tools/read-attachment.ts src/lib/agent/tools/list-attachments.ts src/app/api/agent/attachments
```
Expected: 全部通过（eslint 仅允许既有 `_observations` 一条 warning）。

- [ ] **Step 4: 提交**

```bash
git add src/lib/eval src/__tests__/eval
git commit -m "feat(agent): 读附件 eval fixture + 全量验证"
```

---

## Self-Review 对照

| Spec 章节 | 对应 Task |
|-----------|-----------|
| §3 数据模型 AgentAttachment | Task 1 |
| §4 上传 API + 校验 | Task 2（constants/storage）+ Task 4（route） |
| §5 提取层（pdf/csv/xlsx/txt/docx） | Task 3 |
| §5.1 图片 GLM-4V | Task 7 |
| §6 Agent 集成（清单/工具/快照） | Task 5 + Task 6 |
| §7 固定到项目 | Task 8 |
| §8 UI | Task 9 |
| §9 安全（白名单/私有目录/净化） | Task 2 + Task 4 + Task 9 |
| §10 错误处理 | Task 3/4/5 内嵌 |
| §11 测试与验收 | 各 Task TDD + Task 10 eval |
| §12 实现顺序 | 1→2→3→4→5→6→7→8→9→10 |

**已知权衡（实现时按此）：**
- 图片 OCR 不做本期（spec §13 开放项）；无 vision key 时图片降级 `extract_failed`。
- `review_content` 不纳入视觉提取。
- `describeImage` 用 `stream:false` + `response.json()`（`callAI` 返回 fetch Response，`mockResolvedValue` 需造含 `json()` 的假 Response）。
- spec §4 的"重复上传去重（同文件 hash TTL）"本期不做（YAGNI）：前端 chip 已按文件引用去重，连点由上传中状态禁用兜底。
- `AgentAttachmentInfo.charCount/truncated` 为计算字段（不落库），`read_attachment` 用 `extractedText.length` 推导。
