# 方向成果卡（Direction ResultCard）设计 —— 论文→方向回写闭环

- **日期**：2026-08-09
- **分支**：main
- **状态**：已批准（2026-08-09）
- **前置**：[2026-07-04-direction-planning-design.md](./2026-07-04-direction-planning-design.md)（Direction 方向规划模块）、ENG-PR-210（Direction→Writing 桥接，已实现）
- **目标**：把「单篇论文=独立项目」的组织形态，升级为「以研究方向为核心」的科研平台雏形——论文完成后成果回写方向，方向成为用户主入口。

## 1. 背景与问题

### 1.1 现状

`Direction`（研究方向）模块已具备完整的下行链路：

```
Direction（方向战略规划）✅
  资产扫描 → 8 维分析 → PaperCandidate 选题
  评估契约 · 实验方案 · 基金标书 · 文献 corpus
  论文路线图（DirectionRoadmap，含 RoadmapPaper[].linkedProjectId + status）
        │
        ▼ createProjectFromRoadmap（已接好）
Project（单篇论文）✅
  大纲 → 蓝图 → 多 Agent 写作 → 质量审查 → 导出
        │
        ▼
        ✗ 论文→方向的「向上回环」缺失：写完即断
```

**核心缺口**：方向→论文的「向下」链路通了，但论文→方向的「向上」回环没有。论文完成后：
- 不沉淀核心结论到方向层
- 不自动推进路线图状态（`RoadmapPaper.status`）
- 不刷新「待研究缺口」清单
- 多篇论文之间没有「这个方向研究到什么程度」的连续认知

### 1.2 目标

- 论文完成后，用户手动触发 **Agent 提炼成果卡**（核心结论/解决的缺口/用到的数据/新增文献）
- 成果卡独立表存储，方向页提供成果卡流
- 提炼时联动推进路线图状态（writing → submitted）
- 为「Agent 自主科研」（远期）打地基——成果回写是 Agent 跨论文积累的载体

### 1.3 非目标（明确不做）

- **不碰现有写作管线**（writing pipeline / langgraph / RAG 引擎不变）
- **不做实验数据资产库**——数据「有但很散」，仅做结论级摘要（`dataBasis` 轻量字段）
- **不做多用户权限**——单用户 + 预留扩展（`Direction.userId` 已存在）
- **不做 Agent 自主选题/假设生成**——那是 ENG-PR-200（半自主方向 Agent），本设计只做成果回写地基
- **不做成果卡自动触发**——手动触发为主，可后续加自动检测提示

## 2. 数据模型（Prisma）

新增 `ResultCard` 表，关联 `Direction` 与 `Project`：

```prisma
// prisma/schema.prisma
model ResultCard {
  id            String    @id @default(cuid())
  directionId   String
  direction     Direction @relation(fields: [directionId], references: [id], onDelete: Cascade)
  projectId     String
  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectTitle  String    // 冗余快照，删除/改名后仍可展示
  coreFindings  Json      // string[] 核心结论 3-5 条
  solvedGaps    Json      // string[] 解决的路线图缺口（gapId 或描述）
  dataBasis     Json      // string[] 用到的数据（轻量摘要，非重资产库）
  newReferences Json      // string[] 新增/使用的关键文献（title 或 bib）
  generatedAt   DateTime  @default(now())
  createdAt     DateTime  @default(now())

  @@index([directionId])
  @@index([projectId])
}
```

`Direction` 关系更新（`schema.prisma` `model Direction` 增加）：

```prisma
  resultCards   ResultCard[]
```

同时 `RoadmapPaper.status` 已支持 `planned | writing | submitted | published`，提炼成功时由 writing → submitted（复用现有 roadmap PATCH API，见第 4 节）。

**migration**：新增一个 Prisma migration（`npx prisma migrate dev --name add_result_cards`）。

## 3. 成果提炼契约与逻辑

### 3.1 契约（`src/contracts/result-card.ts`，新建）

```ts
export interface ResultCard {
  id: string;
  directionId: string;
  projectId: string;
  projectTitle: string;
  coreFindings: string[];
  solvedGaps: string[];
  dataBasis: string[];
  newReferences: string[];
  generatedAt: string;
}

export interface ExtractResultCardInput {
  projectId: string;
  directionSlug: string;
}
```

### 3.2 提炼逻辑（`src/lib/direction-result-card.ts`，新建）

```
extractResultCard(projectId, directionSlug)
  │
  ├─ 1. 读取 Project 全部 Section 内容（readStoredSectionContent）
  ├─ 2. Agent 提炼（复用 writer 模型 / DeepSeek）：
  │     读全篇 → 提取 coreFindings / solvedGaps / dataBasis / newReferences
  │     输出结构化 JSON（对齐现有 agent 工具 parse 模式）
  ├─ 3. 校验：coreFindings 非空，其余字段可空
  ├─ 4. 写 ResultCard 表
  ├─ 5. 推进路线图：RoadmapPaper.status → submitted（按 directionSlug + candidateId）
  └─ 6. 返回 ResultCard
```

**要点**：
- 提炼 prompt 用领域学术约束（沿用现有 `src/lib/prompts/` 风格）：结论必须能从正文找到依据，禁止编造
- `solvedGaps` 匹配方向分析中的缺口（`direction.analysis` 的 gap 列表，尽力匹配，匹配不上存描述文本）
- 失败可重试：提炼失败返回明确错误，不写半张卡

## 4. API 层

新增 `src/app/api/directions/[slug]/result-cards/`：

| 方法 | 路径 | 功能 |
|---|---|---|
| `POST` | `/api/directions/[slug]/result-cards` | 手动触发提炼。body `{ projectId }` → 调 `extractResultCard` → 返回 ResultCard |
| `GET` | `/api/directions/[slug]/result-cards` | 该方向成果卡列表（时间倒序） |
| `DELETE` | `/api/directions/[slug]/result-cards/:id` | 删除一张成果卡 |

**校验**：
- 复用 `requireOwnedDirection`（方向归属校验，与现有 direction API 一致）
- `projectId` 必须属于该方向（project.directionSlug === slug）且存在
- POST 提炼失败：返回 500 + 明确错误信息

## 5. UI 层（方向工作台）

改造 `src/app/directions/[slug]/direction-page-client.tsx`：

```
方向工作台 · {name}
[路线图] [论文] [成果卡] [实验方案] [基金]     ← Tab 区（成果卡为新增 Tab）
```

### 5.1 路线图 Tab（补强）

- 现有 `RoadmapPaper` 卡片保持
- 卡片增加「提炼成果」按钮（仅当 `status === "writing"` 且 `linkedProjectId` 存在时显示）
- 点击 → 调 POST result-cards → 成功后卡片状态变 submitted + 成果卡 Tab 出现新卡 + toast 提示

### 5.2 成果卡 Tab（新增）

- 成果卡流，按 `generatedAt` 倒序
- 每张卡展示：论文标题、核心结论 3-5 条、解决的缺口、用到的数据、新增文献
- 「查看论文」→ `/workbench?id={projectId}`（新窗口）
- 「删除」→ 确认后调 DELETE

## 6. 验收标准

- [ ] `ResultCard` 表 migration 成功，`npx prisma migrate dev` 通过
- [ ] POST result-cards：给定有内容的论文 → 返回含 coreFindings 的 ResultCard
- [ ] 提炼后路线图对应 `RoadmapPaper.status` 变为 `submitted`
- [ ] GET result-cards 返回倒序列表
- [ ] DELETE result-cards 删除成功且路线图状态不回滚
- [ ] 手动创建项目（无 directionSlug）不受影响——不显示提炼按钮
- [ ] 提炼失败有明确错误提示，无半成品卡
- [ ] `npm run typecheck` 0 errors、`npm run lint:src --quiet` 0 errors
- [ ] 文档更新：`docs/DOMAIN_INDEX.md` 增加 ResultCard 条目；`docs/ENGINEERING_OPTIMIZATION_QUEUE.md` 登记

## 7. 影响范围

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | +ResultCard 模型、Direction 关系 |
| `src/contracts/result-card.ts` | 新建契约 |
| `src/lib/direction-result-card.ts` | 新建提炼逻辑 |
| `src/lib/prompts/result-card.ts` | 新建提炼 prompt |
| `src/app/api/directions/[slug]/result-cards/route.ts` | 新建 API（POST/GET） |
| `src/app/api/directions/[slug]/result-cards/[id]/route.ts` | 新建 API（DELETE） |
| `src/components/shared/direction/result-card-list.tsx` | 新建成果卡列表组件 |
| `src/components/shared/direction/direction-roadmap-timeline.tsx` | 加「提炼成果」按钮 |
| `src/app/directions/[slug]/direction-page-client.tsx` | Tab 区加成果卡 |
| `docs/DOMAIN_INDEX.md`、`docs/ENGINEERING_OPTIMIZATION_QUEUE.md` | 文档同步 |

**明确不改**：`src/app/api/writing/*`、`src/lib/agent/langgraph/*`、`src/lib/rag.ts`、`src/services/direction.ts`（roadmap PATCH 复用现有 API）。
