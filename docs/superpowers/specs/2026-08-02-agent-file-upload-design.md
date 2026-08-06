# Agent 对话框文件上传 — 设计（方案 A：会话附件 + read_attachment）

> 创建：2026-08-02
> 方案：**会话级附件 + `read_attachment` / `list_attachments` 工具 + 可选"固定到项目"**
> 核心变更：给 Agent 开一条「文件 → 上下文」通道；默认会话级、可固定到项目；图片走 GLM-4V 视觉提取

---

## 0. 背景与目标

现状：Agent 对话框（`AgentInputBar` → `POST /api/agent`）只接受 `goal` 字符串（`agentSchema`，≤4000 字）+ projectId/sessionId，**没有任何附件通道**。用户想"传一份 PDF/数据进去，让 Agent 看着它干活"目前做不到。

目标：在 Agent 对话框提供**统一文件上传入口**，支持多格式，服务于两类用途：

1. **读 + 总结 / 问答**：把外部文档变成对话上下文，Agent 读文件内容并总结、按文件内容回答、对照文件讨论。
2. **数据分析 / 出图**：上传 CSV/Excel 实验数据，Agent 分析、生成图表。

确认的需求边界（头脑风暴结论）：

| 维度 | 决定 |
|------|------|
| 用途 | 读+总结/问答、数据分析/出图、统一入口 |
| 格式 | PDF / Word / 图片 / CSV·Excel / TXT·MD·LaTeX |
| 驻留 | 默认**会话级** + 可手动**固定到项目**（两者兼顾） |
| 模型约束 | 主模型 DeepSeek 纯文本；图片经视觉模型提取为文本 |

**非目标（本期不做）**：
- 不默认把上传文件导入知识库/文献库（"固定到项目"后才成为项目资产，供复用/检索）。
- 不做独立的文件管理页面/全局文件抽屉。
- 不做跨会话自由文件库（无项目、无会话归属的孤立文件）。

---

## 1. 关键决策记录

| # | 决策 | 理由 |
|---|------|------|
| D1 | 会话级默认 + 手动 pin 到项目 | 对话上下文与项目资产解耦；轻量起步、不污染库 |
| D2 | 图片用 **GLM-4V（复用 Zhipu provider）** 当提取器 | 无 OCR 依赖、同端点只加模型配置；比装 PaddleOCR/tesseract 便宜 |
| D3 | 上传上限 **20MB**、扩展名白名单 | 覆盖论文/数据/文档场景，防滥用 |
| D4 | 不改 `generate_chart` | 该工具已收内联 `csvData`，Agent 经 `read_attachment` 读出 CSV 文本直接传入 |
| D5 | 提取文本**分页**返回（对齐 `read_section` 的 part/offset 语义） | 长文档（整篇 PDF）不炸单轮 LLM 输入 |
| D6 | 文件存**私有磁盘目录**，仅经鉴权 API 访问 | 不落 `public/`，防直接 URL 泄露 |
| D7 | 提取失败**不阻断上传** | 文件照常展示/预览，Agent 收到"无法解析"提示 |

---

## 2. 架构总览

```
用户在 AgentInputBar 拖/选文件
   │
   ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/agent/attachments (multipart)                │
│  鉴权 x-user-id · 大小/白名单校验 · 落盘 + 入库          │
│  按格式提取文本（pdf/docx/csv/xlsx/txt/图片→GLM-4V）     │
│  返回 AgentAttachment 记录（status: ready/extract_failed）│
└─────────────────────────────────────────────────────────┘
   │ goal 注入附件清单
   ▼
Agent ReAct 循环（DeepSeek 纯文本主模型）
   │  ├─ read_attachment(fileId, part?, offset?) → 提取文本（分页）
   │  └─ list_attachments() → 本会话附件清单
   ▼
数据分析：read_attachment 读 CSV 文本 → generate_chart(csvData=…)   [D4 零改动]
   │
   ▼
"固定到项目"（UI 按钮）→ POST /api/agent/attachments/[id]/pin → 项目级资产
```

---

## 3. 数据模型 — `AgentAttachment`

新 Prisma 表：

```
model AgentAttachment {
  id            String  @id @default(cuid())
  userId        String
  sessionId     String?                    // 会话级归属
  projectId     String?                    // "固定到项目"后填写
  pinned        Boolean @default(false)
  fileKey       String                     // data/attachments/{userId}/{id}/{safeName}
  originalName  String
  mimeType      String
  size          Int
  status        AttachmentStatus @default(extracting)
  extractSource String?                    // pdf | docx | csv | excel | text | image_vision | image_ocr | failed
  extractedText String?                    // read_attachment 返回的内容（可空 = 未提取成功）
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, sessionId])
  @@index([userId, projectId])
}

enum AttachmentStatus {
  extracting
  ready
  extract_failed
  unsupported
}
```

说明：
- `sessionId` 与 `projectId` 互斥分支：`pinned=false` 时走 `sessionId`；pin 后填 `projectId` + `pinned=true`（保留 `sessionId` 便于追溯）。
- `extractedText` 建议 `@db.Text`，不做全量预载（大 PDF 文本入 `extractedText` 前先按 `MAX_ATTACHMENT_TEXT_CHARS`（默认 ~50 万字符）截断）。
- 文件磁盘布局：`data/attachments/{userId}/{attachmentId}/{sanitizedName}`。`fileKey` 只存相对路径，读文件一律拼根路径 + 鉴权校验归属。

---

## 4. 上传 API — `POST /api/agent/attachments`

- **格式**：`multipart/form-data`，字段 `file`（单文件；一次一文件，前端可连续传多个）。
- **鉴权**：`x-user-id`（与 `/api/agent` 一致）；Agent 未启用（`AGENT_ENABLED!==1`）时 503。
- **校验**：
  - 大小 ≤ `MAX_ATTACHMENT_MB`（20MB）。
  - 扩展名白名单：`.pdf .docx .txt .md .tex .ris .bib .csv .xlsx .xls .png .jpg .jpeg .webp .gif`；MIME 与扩展名不一致时按扩展名兜底。
  - 文件名净化：去路径分隔符/控制字符，截断到 128 字符，保留原扩展名。
- **落库**：创建 `AgentAttachment`（`status=extracting`），落盘后调用提取层。
- **提取**：同步等待提取完成（提取多数格式 <2s；图片视觉调用 <5s，超时降级 `extract_failed`）。返回 `{attachment}` 含 `status` / `extractedText` 摘要（前 200 字）与 `charCount`。
- **响应**：`201 { attachment }`；校验失败 `400`；未授权 `401`；Agent 未启用 `503`。

重复上传去重：同 `userId + originalName + size + sha256` 在 TTL（默认 5 分钟）内命中已有记录则复用（避免连点/重复拖拽）。

---

## 5. 文本提取层 — `src/lib/agent/attachments/extract.ts`

单一入口 `extractAttachmentText(filePath, mimeType, ext): Promise<ExtractResult>`：

| 格式 | 方式 | 依赖 |
|------|------|------|
| PDF | `pdf-parse`（每页提取，拼接；页间加 `\n\n--- 第 N 页 ---\n\n`） | 已有 `pdf-parse@^2.4.5` |
| TXT / MD / TeX / RIS / Bib | `fs.readFile`（utf8） | 无 |
| CSV | `papaparse` → 转 **Markdown 表格**（`papaparse@^5.5.3`） | 已有 |
| Excel (.xlsx/.xls) | `xlsx` → 每 sheet 转 Markdown 表格 | 已有 `xlsx@^0.18.5` |
| DOCX | `mammoth`（新增小依赖，`extractRawText`） | **新增 `mammoth`** |
| 图片 | 视觉模型 `describeImage()`（见下）→ 结构化描述 | 复用 Zhipu provider |
| 其它 | `unsupported` | — |

- 输出统一：`{ status: 'ready'|'extract_failed'|'unsupported', text?: string, charCount?: number, source: 'pdf'|'docx'|'csv'|'excel'|'text'|'image_vision'|'image_ocr'|'failed' }`。
- 提取结果按 `MAX_ATTACHMENT_TEXT_CHARS`（50 万字符）截断并记录 `truncated` 标志（`read_attachment` 提示"已截断，共 N 字"）。
- **失败隔离**：单个格式解析抛错 → 记 `extract_failed` 与错误信息，不阻断整体上传；同文件可重试提取（`POST /api/agent/attachments/[id]/retry`）。

### 5.1 图片 → 文本（GLM-4V）

`describeImage(filePath, mimeType)`：
- 读取图片为 base64，调用 Zhipu 视觉模型（`glm-4v` 或配置的 `VISION_MODEL`，默认 `glm-4v`；模型名放 `models.ts` 新增 `vision` provider，复用 Zhipu `baseUrl` 与 key）。
- Prompt（中文）：要求输出固定结构——`类型`（截图/表格/数据图/示意图/流程图）、`画面描述`（≤3 句）、`文字内容`（OCR 到的全部文本）、`数据与坐标轴`（若有：轴名、数值、趋势一句话）。
- 成功 → `{ status:'ready', text: 结构化描述, source:'image_vision' }`。
- 无 vision key / 调用失败 → 降级 `{ status:'extract_failed', text: null, source:'image_ocr' }`，Agent 收到"图片无法解析，仅展示预览"。预留 `image_ocr` 枚举位，将来可换 OCR 引擎实现。

---

## 6. Agent 集成

### 6.1 goal 注入附件清单

`runAgentGraphLoop` / `POST /api/agent` 收到 `attachmentIds` 时，在首条 user 消息前拼入清单块（不进 system prompt，跟随对话上下文）：

```
【附件】
- report.pdf（PDF，已提取文本，约 3.2 万字，共 12 页）
  → 可调用 read_attachment("att_xxx") 读取；长文本用 part="head"/"tail" 或 offset 分页。
- data.csv（CSV，已提取为表格，28 行）
- 图1.png（图片，已用视觉模型描述；文字内容见提取文本）
```

只放「文件名 + 类型 + 是否已提取 + 用法提示」，不把全文塞进 goal（大文件按需读）。

### 6.2 新工具 `read_attachment`

```ts
{
  name: "read_attachment",
  description: "读取本会话已上传附件的内容。长文本分页：part=\"head\"|\"tail\"，或用 offset（字符起点）+ maxChars。",
  parameters: { fileId: string; part?: "head"|"tail"; offset?: number; maxChars?: number },
  safety: "read",
}
```
- 校验归属：`attachment.userId === ctx.userId` 且（`sessionId` 匹配当前会话 或 `pinned` 已转项目级且 `projectId` 匹配）。
- 返回 `extractedText` 的窗口（`maxChars` 默认 3000，上限 8000）；支持 `offset` 翻页。
- 未提取成功 → 返回失败消息"附件未提取成功（原因），可让用户重新上传或用图片预览"。
- `repeatTracker` 沿用现有"连续同参视为重复"防护（`safety.ts` 的 `stableArgsKey`）。

### 6.3 新工具 `list_attachments`

```ts
{ name: "list_attachments", description: "列出本会话已上传的附件（id/文件名/类型/字数/提取状态）", parameters: {}, safety: "read" }
```
用于 Agent 主动感知有哪些附件（goal 清单被压缩后仍可查）。

### 6.4 会话恢复

`AgentSessionSnapshot`（`graphStateToSnapshot` / `snapshotToInitialState`）新增 `attachmentIds: string[]`：
- 存快照时记录附件 id 列表；恢复时校验仍属于该 session 后注入 goal 清单，保证续跑后 `read_attachment` 仍可用。
- 会话删除时级联处理（附件可保留为孤儿并允许复用，或随会话清理——本期选：**随会话软保留**，不删盘，仅不可在新会话引用）。

---

## 7. "固定到项目"

- **UI**：附件 chip 上"固定到项目"按钮（需已绑定项目）。
- **API**：`POST /api/agent/attachments/[id]/pin`，body `{ projectId }`。
- **行为**：校验归属 + 项目访问权 → 置 `projectId`、`pinned=true`。返回更新后记录。
- **复用**：pin 后 `read_attachment` 仍可读；数据文件（CSV/Excel）pin 后也可作为项目数据源（本期不新增"项目附件列表页"，Agent 经 `list_attachments`/`read_attachment` 使用即可）。
- 反操作"取消固定"不做（YAGNI）；如需再上传即可。

---

## 8. UI（`AgentInputBar` 扩展）

- 输入框左侧新增**附件按钮**（Paperclip 图标）+ 输入区**拖拽上传**（`onDragOver/onDrop`，仅接受白名单扩展名）。
- 附件 chip 列表在输入框上方（文件名 / 类型图标 / 大小 / 提取状态：`extracting` 转圈、`extract_failed` 警示、`ready` 正常）。
- 发送时：`sendGoal(goal, attachmentIds)` → `useAgent` 把 attachmentIds 一并 POST。
- 消息区：用户气泡旁展示"已带 N 个附件"小标签；Agent 调用 `read_attachment` 的 action 卡片照常渲染（复用 `AgentActionCard`）。
- "固定到项目"按钮仅在绑定项目后显示。
- 附件可删除（发送前移除 chip；发送后本会话内不可删，YAGNI）。

`useAgent` hook（`sendGoal`）签名扩展为 `sendGoal(goal, opts?: { attachmentIds?: string[] })`，向后兼容。

---

## 9. 安全

- 鉴权：所有附件 API 走 `x-user-id`；`read_attachment`/pin 双重校验归属。
- 大小/白名单/文件名净化见 §4；拒绝可执行扩展名（`.exe .sh .bat .ps1 .html .svg` 等一律不在白名单）。
- 私有磁盘目录：`data/attachments/`（`.gitignore` 追加 `data/attachments/`），**不映射到 `public/`**；如需预览图片走 `GET /api/agent/attachments/[id]/preview`（鉴权 + 仅图片 mime + 尺寸上限），不暴露原始路径。
- 上传速率：沿用 `proxy.ts` 限流；单请求体积由 Next 路由 `bodyParser` 限制兜底。

---

## 10. 错误处理

| 场景 | 处理 |
|------|------|
| 大小超限 / 扩展名不允许 | 400 + 中文提示，前端 chip 标红 |
| 提取超时（>8s） | `status=extracting` 落库，返回"稍后重试提取"；`read_attachment` 收到 extracting 状态提示等待 |
| 提取抛错 | `extract_failed` + 错误摘要；Agent 提示"无法解析，仅展示文件名"；可 `POST /attachments/[id]/retry` |
| 图片无视觉 key / GLM-4V 失败 | 降级 `extract_failed`（预留 `image_ocr`） |
| `read_attachment` 越界 offset | 返回空 + 提示"已到末尾"（对齐 `read_section` 行为） |
| 会话恢复后附件不可用 | 清单过滤掉不属于该会话的 id，Agent 不引用 |

---

## 11. 测试与验收

**单元测试**
- `extract.ts`：PDF（小样张）、CSV→Markdown 表格、Excel→多 sheet 表格、TXT 直读、unsupported、超长截断。
- `read_attachment`：分页 head/tail/offset、越界、跨会话归属拒绝、未提取状态。
- `list_attachments`：空/多附件/过滤。
- goal 清单注入：`buildAttachmentManifest` 纯函数（文件名/类型/字数/截断标志）。

**集成测试**
- 上传 API：multipart 正常流、白名单拒绝、超限 400、未授权 401。
- pin API：归属校验、项目访问权、反序列化。

**Agent 脚本 eval**：`agent-scripts.eval.test.ts` 补 1 条 fixture：目标"读取上传的 report.pdf 并总结" → 断言 trace 出现 `read_attachment` 且最终文本引用文件名。

**验收清单**
- [ ] 对话里能拖/选一个 PDF → 说"总结这份" → Agent 读到内容并总结。
- [ ] 传 CSV → 说"画个柱状图" → Agent 出图（generate_chart 零改动）。
- [ ] 传图片 → 视觉模型描述出现在 `read_attachment` 输出里（或有降级提示）。
- [ ] 新对话/续跑后 `read_attachment` 仍可用（会话快照恢复）。
- [ ] "固定到项目"后，另一会话可引用该附件。

---

## 12. 实现顺序（分 4 步，每步可独立验收）

1. **数据与上传**：Prisma 表 + 迁移 + `POST /api/agent/attachments`（pdf/csv/xlsx/txt 提取 + 落盘 + 校验）。
2. **Agent 工具**：`read_attachment` / `list_attachments` + goal 清单注入 + 会话快照携带 attachmentIds。
3. **图片视觉**：`models.ts` 加 `vision` provider（GLM-4V）+ `describeImage()` + 降级。
4. **UI 与 pin**：`AgentInputBar` 附件按钮/拖拽/chip + `sendGoal` 扩展 + pin API + 预览 API。

DOCX 依赖（`mammoth`）随第 1 步一并加；若生产环境不便装，退化为"docx 提取失败仅展示"并保留 `mammoth` 可选开关。

---

## 13. 开放问题（后续可扩展，本期不阻塞）

- 全局文件库/统一文件管理页（跨项目文件中心）。
- 图片 OCR 引擎（`image_ocr`）作为视觉模型的离线兜底。
- 上传文件的 RAG 索引（让 Agent `search_knowledge` 命中附件内容）。
- 附件与文献库打通（pin 后可一键转 `KnowledgeFile`）。
