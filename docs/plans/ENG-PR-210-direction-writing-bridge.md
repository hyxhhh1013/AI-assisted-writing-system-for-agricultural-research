# ENG-PR-210：Direction → Writing 文献桥接

> **状态**：规划中  
> **创建日期**：2026-07-05  
> **依赖**：ENG-PR-100（Direction 基础）、ENG-PR-096a-d（协作扩写）、ENG-PR-200 Bug 1 修复  
> **母文档**：本文件  
> **队列登记**：[`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 10（新增）

---

## 0. 问题陈述

### 0.1 当前状态

Direction（方向战略规划）和 Writing（写作）是两个弱连接模块：

```
Direction                           Writing
─────────                           ───────
资产清点 (scan API)                 扩写面板 (writing-panel)
  → 按方向分类扫描知识库 PDF          → 从 project.researchDirection 
  → 返回 PaperAsset[]（有 bib）         字符串做 RAG 关键词检索
                                     → 文献检索是可选的
Socratic 预承诺                         （对综述模式无强制要求）
  → 确定评价标准
                                     
8 维度分析                           扩写管线 (Writer→Verifier→Refiner)
  → 评估数据充分性/创新性/缺口           → 不知道这个项目来自 Direction
  → 生成 PaperCandidate[]              → 不知道需要覆盖哪些文献
                                     
路线图                               写作蓝图 (WritingBlueprint)
  → 论文优先级排序                      → 有 researchDirection 字段
  → 用户点"开始写作"                    → direction 上下文字段被
  → createProjectFromRoadmap()           zod schema 静默丢弃
     ├─ mode: "research" 硬编码
     ├─ dataBasis: [] 空数组
     └─ 无文献清单注入
```

### 0.2 核心差距

1. **Direction scan 的 PaperAsset[] 没有变成项目 references**——方向已扫描出的文献白白丢失
2. **Blueprint 丢弃了 direction 上下文字段**——motivationFromGap、targetJournal 等传了但被 zod strip
3. **综述模式文献检索是可选的**——不符合"综述应先确定文献范围"的业务逻辑
4. **mode 硬编码为 "research"**——综述论文也创建为研究型项目

### 0.3 设计原则

- **全部改动是加性的**：新增 contract、新增可选字段、新增函数。不修改现有 API 的行为契约
- **不破坏现有流程**：手动创建项目、研究模式写作的现有行为完全不变
- **逐步可交付**：每期完成后可以独立验证，不依赖后续期
- **新旧隔离**：Direction→Writing 桥接逻辑集中在 `src/lib/direction-writing-bridge.ts`，不散落在各组件里

---

## 1. 代码清点

### 1.1 需要改动的文件

| # | 文件 | 当前职责 | 改动类型 | 改动量 |
|---|------|---------|---------|--------|
| 1 | **新建** `src/contracts/direction-writing-bridge.ts` | — | 新增契约 | ~80 行 |
| 2 | **新建** `src/lib/direction-writing-bridge.ts` | — | 新增桥接逻辑 | ~120 行 |
| 3 | `src/services/direction.ts` (L330-388) | `createProjectFromRoadmap`：创建项目+蓝图+同步 | 调用新桥接函数，改入参 | ~30 行 |
| 4 | `src/components/shared/direction/direction-roadmap-timeline.tsx` (L74-105) | `handleCreateProject`：UI 触发创建 | 传入文献清单 | ~20 行 |
| 5 | `src/contracts/writing-blueprint.ts` (L58-70) | WritingBlueprint 接口定义 | `sectionGuides` 增加 `assignedSources` | ~10 行 |
| 6 | `src/lib/validations.ts` | Zod schema：blueprintSchema、writingBlueprintPayloadSchema | 增加 direction 相关字段校验 | ~30 行 |
| 7 | `src/app/api/outline/blueprint/route.ts` (L61-138) | Blueprint 生成 API | 透传新字段到 prompt | ~10 行 |
| 8 | `src/lib/prompts/blueprint.ts` | Blueprint prompt 构建 | 消费 direction 上下文字段 | ~20 行 |
| 9 | `src/hooks/use-writing-source-selection.ts` (L42-227) | 文献源选择 hook | 综述模式强制确认 | ~25 行 |
| 10 | `src/components/shared/writing-panel.tsx` (L247-258, L338-352) | 写作面板 | 综述模式下 canGenerate 逻辑调整 | ~20 行 |

**总计**：2 个新文件 + 8 个现有文件改动，~365 行新增代码。

### 1.2 不改动的文件（明确排除）

| 文件 | 原因 |
|------|------|
| `src/app/api/writing/` 所有文件 | writing pipeline 不需要感知 direction，它只消费最终的 context |
| `src/app/workbench/workbench-page-client.tsx` | `onGenerate`/`handleApplyAiContent` 逻辑不变，subsection 匹配已在 ENG-PR-200 Bug 1 修复 |
| `src/app/api/directions/[slug]/analyze/route.ts` | 分析管线不变 |
| `src/app/api/directions/[slug]/scan/route.ts` | scan API 不需要改，用它的返回值即可 |
| `src/lib/rag.ts` | RAG 引擎不变 |
| `src/app/api/projects/route.ts` | 项目创建 API 不变，通过 service 层调它 |

---

## 2. 数据流设计

### 2.1 目标数据流

```
Direction 分析完成
  │
  ├─ scan API → PaperAsset[]（知识库文献，含 bib）
  ├─ 8 维分析 → PaperCandidate（论文选题，含 tier/scores/suggestedJournal）
  │
  ▼
用户点击"开始写作"
  │
  ▼
direction-writing-bridge.buildPaperBrief(directionSlug, candidateId)
  │
  ├─ 1. 提取 scan 结果中的 PaperAsset[] → 筛选与 candidate 相关的文献
  ├─ 2. 按相关性排序（title 关键词匹配 + bib 质量分）
  ├─ 3. 确定论文类型（research vs review）→ 设置正确的 project mode
  ├─ 4. 组装 DirectionWritingContext：
  │     ├─ paperType: "review" | "research"
  │     ├─ suggestedJournal
  │     ├─ requiredReferences[]（文献清单，含 sourceKey/title/authors/relevance）
  │     ├─ gaps[]（从 D3 提取）
  │     └─ enhancedSectionHints（从 D5/D7 提取的主题建议）
  │
  ▼
createProjectFromRoadmap(paperTitle, directionSlug, candidateId, context)
  │
  ├─ 1. POST /api/projects（mode 正确设置，researchDirection 传入）
  ├─ 2. 将 requiredReferences 注入项目 references（批量 PATCH）
  ├─ 3. POST /api/outline/blueprint（传入完整 direction 上下文）
  │     └─ prompt 现在能看到：motivationFromGap、suggestedJournal、pendingExperiments
  ├─ 4. PATCH roadmap paper status → "writing"
  │
  ▼
工作台打开项目
  │
  ├─ references 已含方向确定的文献
  ├─ WritingBlueprint.sectionGuides 含 assignedSources
  ├─ 综述模式：写作面板检测到 projectMode==="review" + references 非空
  │   → 文献自动预加载，不可跳过确认
  └─ 研究模式：现有行为不变
```

### 2.2 新增契约

```typescript
// src/contracts/direction-writing-bridge.ts

/** 文献在论文中的角色 */
type SourceRole = "core" | "supporting" | "background";

/** 单篇预确定文献 */
interface RequiredReference {
  sourceKey: string;        // 知识库文件名，用于 RAG 检索
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  doi?: string;
  role: SourceRole;         // 在论文中的角色
  assignedSections: string[]; // 建议分配到哪些章节
}

/** Direction → Writing Handoff 上下文 */
interface DirectionWritingContext {
  paperType: "review" | "research";
  suggestedJournal?: string;
  /** 从 Direction scan + 分析提取的必读文献 */
  requiredReferences: RequiredReference[];
  /** 从 D3 提取：为什么写这篇论文 */
  motivationFromGap?: string;
  /** 从 D6 提取：需要补什么实验 */
  pendingExperiments?: string[];
  /** 从 D5/D7 提取的写作主题建议 */
  themeSuggestions?: string[];
}
```

---

## 3. 分阶段实施

### Phase A：契约 + 桥接函数（P0，~200 行，1 天）

**目标**：文献清单能从 Direction 流到 Writing。项目创建时自动带 references。

**改动文件**：

| 文件 | 改动 |
|------|------|
| **新建** `src/contracts/direction-writing-bridge.ts` | DirectionWritingContext、RequiredReference 类型定义 |
| **新建** `src/lib/direction-writing-bridge.ts` | `buildPaperBrief(directionSlug, candidateId)` — 从 Direction 数据提取文献清单的纯函数 |
| `src/services/direction.ts` L330-388 | `createProjectFromRoadmap` 改为：先调 buildPaperBrief → 注入 references → 创建项目 |
| `src/components/shared/direction/direction-roadmap-timeline.tsx` L74-105 | `handleCreateProject` 不再传 `dataBasis: []`，改为传 `paperType` 和空 requiredReferences（由后端填充） |

**`buildPaperBrief` 核心逻辑**：

```typescript
// src/lib/direction-writing-bridge.ts
export async function buildPaperBrief(
  directionSlug: string,
  candidateId?: string
): Promise<DirectionWritingContext> {
  // 1. 获取 direction 数据
  const direction = await prisma.direction.findUnique({ where: { slug: directionSlug } });
  
  // 2. 从 scan 结果获取知识库文献
  const kbFiles = await prisma.knowledgeFile.findMany({
    where: { category: { in: direction.categories } },
    take: 200,
  });
  
  // 3. 提取 PaperCandidate（如果指定了 candidateId，只取该 candidate）
  const analysis = direction.analysis as DirectionAnalysis | null;
  const candidates = candidateId
    ? (analysis?.paperCandidates || []).filter(c => c.id === candidateId)
    : (analysis?.paperCandidates || []);
  
  // 4. 确定 paperType
  // 目前根据 direction 的默认模式判断；后续可让用户在 UI 选择
  const paperType: "review" | "research" = "review"; // 方向规划默认产出综述
  
  // 5. 组装 requiredReferences：kbFiles → RequiredReference[]
  const references: RequiredReference[] = kbFiles
    .filter(f => { /* 有 bib 数据 */ })
    .map(f => ({ sourceKey: f.name, ...extractBib(f) }))
    .slice(0, 50);
  
  // 6. 返回
  return {
    paperType,
    suggestedJournal: candidates[0]?.suggestedJournal,
    requiredReferences: references,
    motivationFromGap: candidates[0] ? extractMotivation(candidates[0], analysis) : undefined,
    pendingExperiments: candidates[0]?.requiredExperiments || [],
    themeSuggestions: extractThemes(candidates[0], analysis),
  };
}
```

**验收标准**：
- [ ] `DirectionWritingContext` 类型定义完整，通过 tsc
- [ ] `buildPaperBrief` 能正确从 direction + kbFiles 提取文献清单
- [ ] `createProjectFromRoadmap` 创建的项目 references 非空（含 Direction 扫描到的文献）
- [ ] 手动创建项目（非 Direction 来源）流程不受影响
- [ ] `npm run check` 通过

---

### Phase B：Blueprint 上下文注入（P1，~60 行，半天）

**目标**：Blueprint 不再丢弃 direction 上下文字段。WritingBlueprint.sectionGuides 支持 `assignedSources`。

**改动文件**：

| 文件 | 改动 |
|------|------|
| `src/contracts/writing-blueprint.ts` L35-40 | SectionGuide 增加 `assignedSources?: string[]` |
| `src/lib/validations.ts` | `blueprintSchema` 增加 `motivationFromGap`、`targetJournal`、`pendingExperiments` 可选字段；`writingBlueprintPayloadSchema` 增加 `assignedSources` |
| `src/app/api/outline/blueprint/route.ts` L63-84 | 解析新字段，传给 prompt builder |
| `src/lib/prompts/blueprint.ts` | `buildBlueprintPrompt` 消费新字段，注入 prompt 的写作指导部分 |

**验收标准**：
- [ ] `createProjectFromRoadmap` 传入的 `motivationFromGap`、`targetJournal` 等字段到达 Blueprint prompt
- [ ] 生成的 Blueprint 的 `sectionGuides[].assignedSources` 有值
- [ ] 旧 Blueprint（无这些字段）仍可正常 parse（`parseWritingBlueprint` 向后兼容）
- [ ] `npm run check` 通过

---

### Phase C：综述模式文献强约束（P1，~50 行，半天）

**目标**：综述模式写作前必须确认文献。预加载 Direction 传入的文献。

**改动文件**：

| 文件 | 改动 |
|------|------|
| `src/hooks/use-writing-source-selection.ts` L104-208 | 新增逻辑：当 `projectMode==="review"` 且项目 references 非空时，`canGenerate` 要求 `confirmed` |
| `src/components/shared/writing-panel.tsx` L247-352 | 综述模式下，项目创建后自动触发文献检索预加载；`generateDisabledReason` 文案适配 |

**核心逻辑**：

```typescript
// use-writing-source-selection.ts 改动

// 新增参数
interface WritingSourceSelectionParams {
  // ...existing
  /** 项目是否已有从 Direction 传入的预确定文献 */
  hasPreloadedReferences?: boolean;
}

// canGenerate 逻辑
const needsConfirmation = hits.length > 0 || fetchedOnce;
// 综述模式：有预加载文献时必须确认
const reviewRequiresConfirmation = projectMode === "review" && hasPreloadedReferences;
const canGenerate = reviewRequiresConfirmation
  ? (confirmed && !previewStale)
  : (!needsConfirmation || (confirmed && !previewStale));
```

**验收标准**：
- [ ] 综述模式项目：未确认文献前，"开始扩写"按钮置灰，提示"综述写作需先确认文献来源"
- [ ] 研究模式项目：文献检索仍为可选，行为不变
- [ ] 手动创建的非综述项目：不受影响
- [ ] `npm run check` 通过

---

### Phase D：端到端验证 + 文档（P2，半天）

**目标**：完整链路测试 + 队列文档更新。

**验收标准**：
- [ ] Direction 分析 → 路线图 → 创建综述项目 → 项目 references 含 Scan 出的文献
- [ ] 综述项目写作面板：文献自动预加载，必须确认后才能扩写
- [ ] 扩写结果正确插入到综述章节（与 ENG-PR-200 Bug 1 修复联动验证）
- [ ] 手动创建项目流程不受影响
- [ ] 更新 `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 10
- [ ] 更新 `DOMAIN_INDEX.md` 增加 Direction-Writing 桥接条目

---

## 4. 影响范围汇总

### 4.1 新增文件（2 个）

```
src/contracts/direction-writing-bridge.ts   (~80 行)
src/lib/direction-writing-bridge.ts         (~120 行)
```

### 4.2 修改文件（8 个，全部加性改动）

```
src/services/direction.ts                        L330-388  (+30 行)
src/components/.../direction-roadmap-timeline.tsx L74-105   (+20 行)
src/contracts/writing-blueprint.ts               L35-40    (+10 行)
src/lib/validations.ts                           2 schema  (+30 行)
src/app/api/outline/blueprint/route.ts           L63-84    (+10 行)
src/lib/prompts/blueprint.ts                               (+20 行)
src/hooks/use-writing-source-selection.ts        L104-208  (+25 行)
src/components/shared/writing-panel.tsx          L247-352  (+20 行)
```

### 4.3 不改动文件（明确排除，防止 scope creep）

```
src/app/api/writing/*           — 管线不感知 direction，消费最终 context
src/app/workbench/*             — onGenerate/handleApplyAiContent 逻辑已在 Bug 1 修复
src/app/api/directions/*/analyze — 分析管线不变
src/app/api/directions/*/scan   — scan API 不变，作为数据源消费
src/lib/rag.ts                  — RAG 引擎不变
src/app/api/projects/route.ts   — 项目创建 API 不变
src/hooks/use-writing-panel-generate.ts — buildWritingRequest 不变
src/lib/utils.ts                — 已在 Bug 1 修复完成
src/lib/academic-numbering.ts   — 已在 Bug 1 修复完成
```

### 4.4 风险矩阵

| 风险 | 概率 | 缓解 |
|------|------|------|
| 文献清单过长（>50 篇）导致 references 臃肿 | 中 | `buildPaperBrief` 限制 top 50 + 去重 |
| 旧 Blueprint parse 失败（新增字段不兼容） | 低 | 所有新字段用 `?` 可选，`parseWritingBlueprint` 新增字段 forward-compat |
| 综述模式强制确认影响用户体验 | 低 | 在 UI 上明确提示原因，用户可以一键全选确认 |
| 知识库没有该方向文献时 references 为空 | 中 | `buildPaperBrief` 返回空清单时不阻塞，写作面板退回到现有流程 |

---

## 5. 与现有 PR 的关系

| PR | 处理 |
|----|------|
| ENG-PR-200 Bug 1（mapToSectionForMode 修复） | **先合入**，本 PR 依赖它 |
| ENG-PR-200 Bug 2（综述文献流程） | **被本 PR 替代**，Phase C 实现了完整的综述文献约束 |
| ENG-PR-082（Verifier 结构化） | 不受影响，Verifier 不感知文献来源 |
| ENG-PR-094（OA 全文） | 不受影响，但未来可联动：OA 入库 → Direction scan 自动发现新文献 |

---

## 6. 验收总清单

### Phase A
- [ ] `DirectionWritingContext` 类型通过 tsc
- [ ] `buildPaperBrief` 正确提取文献清单
- [ ] Direction→项目 references 非空
- [ ] 手动创建项目不受影响

### Phase B
- [ ] direction 上下文字段到达 Blueprint prompt
- [ ] `sectionGuides[].assignedSources` 有值
- [ ] 旧 Blueprint 向后兼容

### Phase C
- [ ] 综述模式强制文献确认
- [ ] 研究模式行为不变

### Phase D
- [ ] 端到端链路验证通过
- [ ] 文档更新
