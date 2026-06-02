# 论文质量模块完整开发计划

> 更新时间：2026-06-02
> 状态：Phase 1～3 已在 main 落地；Phase 4 文档收尾见 ENG-PR-050

## 实现状态对照（2026-06-02）

| 计划项 | 状态 | 实际路径 / 说明 |
|--------|------|-----------------|
| 统一查重 service | **已实现** | `src/services/plagiarism-service.ts`；`api/plagiarism/v2`、`check` 为薄路由 |
| 降重 service | **已实现** | `src/services/rewrite-service.ts` + `api/plagiarism/rewrite` |
| 审查四维度 | **已实现** | `src/services/review-service.ts`、`/review` 页面、`api/review/*` |
| 查重 SSE 进度 | **已实现** | v2/check 路由 `Accept: text/event-stream` |
| 旧 `plagiarism-check.ts` | **已删除** | 无引用；勿恢复 |
| `similarity.ts` 算法 | **保留** | `extractNGrams` / `jaccard` / `cosine` 被 service 与 RAG 使用 |
| 统一 `/quality` 单页三 Tab | **跳过** | 保留 `/plagiarism` + `/review` + 工作台 panel |
| `reviewIntegrity` 独立 flag | **跳过** | 仅 `NEXT_PUBLIC_ENABLE_REVIEW` 总开关 |
| Phase 4.5 清 any | **另 PR** | ENG-PR-054 |

**手动验收**（发布前）：查重 → 降重建议 → 审查 → 单项 fix 各走通一条。

---

## 一、现状诊断

> 以下 §1.1～1.3 为 2026-05-29 诊断快照；多项已在后续 PR 中修复，以「实现状态对照」为准。

### 1.1 查重系统问题

| 类别 | 问题 | 严重度 | 位置 |
|------|------|--------|------|
| Bug | v2 `semanticMatches` 计算后未合并到 `matches`，Embedding 语义检测实际无效 | P0 | `v2/route.ts:126-143` |
| Bug | 前端 `webSearch` 传参但后端完全忽略，联网搜索形同虚设 | P0 | `page.tsx` / `panel.tsx` |
| Bug | 前端 `matchType` 类型缺少 `"self"` 和 `"ai"`，无法正确展示这两种匹配 | P1 | `page.tsx` / `panel.tsx` |
| 架构 | 三套查重逻辑并存（v1 service、v1 API、v2 API），阈值不同、代码大量重复 | P1 | `plagiarism-check.ts` / `check/route.ts` / `v2/route.ts` |
| 性能 | DB 写入用 `for` 循环逐条 `create`，应改 `createMany` | P2 | 全部三个实现 |
| 性能 | v2 Embedding 逐段串行计算，无缓存，O(unmatched × chunks) | P2 | `v2/route.ts:128-141` |
| 质量 | `similarity.ts` 中 `computeSimHash` 等 5 个函数从未被使用，死代码 | P3 | `similarity.ts` |
| 体验 | 无 SSE 进度推送，长文本查重用户只能等待 | P2 | 所有 API |
| 体验 | `sourceOffset` 始终为 0，无法定位原文位置 | P2 | 所有 API |

### 1.2 降重系统问题

| 类别 | 问题 | 严重度 | 位置 |
|------|------|--------|------|
| 功能 | 4 种策略共用同一 prompt，仅靠策略名区分，实际差异化极弱 | P0 | `rewrite-service.ts:33-39` |
| 功能 | 前端没有接受/拒绝按钮，PATCH API 写好但未集成 | P0 | `plagiarism-panel.tsx` |
| 功能 | 接受后无法替换原文，也无"复制改写文本"按钮 | P1 | — |
| 功能 | 降重后不支持重新查重验证，闭环未形成 | P1 | — |
| 质量 | prompt 硬编码在 service 中，未纳入 `prompts/` 体系 | P1 | `rewrite-service.ts:33` |
| 质量 | prompt 缺少负面约束、领域适配、改写技巧指导 | P1 | 同上 |
| 质量 | 无语义一致性校验，改写后不验证是否保持原意 | P2 | — |
| 质量 | 无长度/格式校验，模型可能输出过短/过长文本 | P2 | — |
| 质量 | `parseResponse` 未清理 Markdown 包裹、前缀说明 | P2 | `rewrite-service.ts:74-82` |
| 架构 | 4 种策略串行调用 AI，无并发 | P2 | `rewrite-service.ts:27-51` |
| 数据 | `RewriteSuggestion` 缺少 `createdAt`、`rewrittenSimilarity` 字段 | P2 | `schema.prisma` |

### 1.3 审查功能现状

- 无独立审查模块
- 一致性检查（consistency）在工作台 dialog 中，侧重跨章节数据一致性
- Verifier 在写作流水线中，侧重引用核实和 overclaim
- 两者都**不覆盖**学术规范、论证质量、结构规范、学术诚信检测

---

## 二、目标架构

### 2.1 统一页面结构

```
/quality（或保留 /plagiarism 路径）
├─ Tab 1: 🔍 查重  — 输入 → 结果概览 → 匹配详情
├─ Tab 2: ✏️ 降重  — 待降重段落 → 策略选择 → 改写建议 → 接受/拒绝 → 重新查重
├─ Tab 3: 📋 审查  — 开始审查 → 结果报告（概要/评价/优点/问题/建议）→ 单项修复
└─ 底部: 历史记录入口
```

### 2.2 数据流全景

```
                    ┌─────────────────────────────────────┐
                    │           /quality 页面              │
                    └──────────┬──────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │   查重 Tab   │    │   降重 Tab   │    │   审查 Tab   │
    │             │    │             │    │             │
    │ POST        │    │ POST        │    │ POST        │
    │ /api/review/│    │ /api/review/│    │ /api/review │
    │ plagiarism  │    │ rewrite     │    │ (4 维度并行) │
    │             │    │             │    │             │
    │ → SSE 进度  │    │ → 4 策略并行 │    │ → 综合报告  │
    │ → 匹配结果  │    │ → 改写建议   │    │ → 评分 + 问题│
    │ → 分数      │    │ → 接受/拒绝  │    │ → AI 修复   │
    └─────────────┘    └──────┬──────┘    └─────────────┘
                              │
                         重新查重闭环
```

### 2.3 检测器插件化架构

核心思路：**检测器插件化 + 标准化输出 + 逐步接入外部能力**

```typescript
// src/types/detector.ts

// 所有检测器的标准化输出
export interface DetectorResult {
  detectorId: string;
  detectorName: string;
  detectorVersion: string;
  confidence: "high" | "medium" | "low";
  issues: DetectorIssue[];
  stats: {
    checked: number;
    suspicious: number;
    confirmed: number;
    processingTime: number;
  };
}

export interface DetectorIssue {
  id: string;
  category: IssueCategory;
  subcategory: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;  // 0-1
  location: {
    section?: string;
    paragraph?: number;
    line?: number;
    table?: string;
    figure?: string;
    reference?: number;
    offset?: number;
    length?: number;
  };
  evidence: {
    originalText: string;
    matchedText?: string;
    matchSource?: string;
    matchUrl?: string;
    similarity?: number;
    metadata?: Record<string, unknown>;
  };
  description: string;
  suggestion: string;
}

export type IssueCategory =
  | "plagiarism" | "self_plagiarism" | "citation_fraud"
  | "data_fraud" | "stats_fraud" | "ai_generated"
  | "image_fraud" | "writing_quality" | "structure"
  | "logic" | "integrity";

// 检测器接口
export interface IDetector {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  capabilities: {
    categories: IssueCategory[];
    requiresExternalApi: boolean;
    requiresApiKey: boolean;
    avgProcessingTime: number;
    confidence: "high" | "medium" | "low";
  };
  detect(input: DetectorInput): Promise<DetectorResult>;
  verify?(issue: DetectorIssue): Promise<{ confirmed: boolean; reason: string }>;
}
```

#### 已实现的检测器（Phase 1-3）

| 检测器 ID | 名称 | 类别 | 可信度 | 实现方式 |
|-----------|------|------|--------|---------|
| `local-ngram` | 本地 n-gram 比对 | plagiarism, self_plagiarism | medium | similarity.ts |
| `embedding-semantic` | Embedding 语义匹配 | plagiarism | medium | 本地 RAG |
| `academic-style` | 学术规范检查 | writing_quality | medium | DeepSeek |
| `argument-check` | 论证质量检查 | logic | medium | DeepSeek |
| `structure-check` | 结构规范检查 | structure | high | 规则 + DeepSeek |
| `citation-format` | 引用格式验证 | citation_fraud | medium | 正则 |
| `data-consistency` | 数据一致性检查 | data_fraud | medium | DeepSeek |
| `stats-check` | 统计合理性检查 | stats_fraud | low | 模式匹配 |
| `cliche-detect` | 学术套话检测 | writing_quality | high | 正则 |

#### 未来可接入的检测器（扩展空间）

| 检测器 ID | 名称 | 需要什么 | 接入难度 |
|-----------|------|---------|---------|
| `crossref-verify` | CrossRef 文献验证 | CrossRef API（免费） | ⭐ 低 |
| `openalex-verify` | OpenAlex 文献验证 | OpenAlex API（免费） | ⭐ 低 |
| `cnki-search` | 知网文献比对 | 知网 API（付费） | ⭐⭐ 中 |
| `ai-text-detect` | AI 生成文本检测 | GPTZero API | ⭐ 低 |
| `image-hash` | 图像重复检测 | 图像哈希算法（本地） | ⭐⭐ 中 |
| `vlm-verify` | VLM 图像分析 | 视觉模型 API | ⭐⭐ 中 |
| `stat-calc` | 统计计算验证 | jstat 库 | ⭐⭐ 中 |

### 2.4 审查四维度

| 维度 | 代号 | 检查点 | AI 模型 |
|------|------|--------|---------|
| 学术规范 | `academic` | 口语化、术语一致性、句式规范、模糊表述、公式规范 | DeepSeek |
| 论证质量 | `argument` | 论点论据匹配、推理链、因果合理性、overclaim、反面论证、文献批判性 | DeepSeek |
| 结构规范 | `structure` | 章节完整性、图表引用、参考文献格式、摘要四要素、关键词 | DeepSeek |
| 学术诚信 | `integrity` | 引用真实性、数据内部一致性、统计合理性、方法可复现性、结果合理性 | DeepSeek |

---

## 三、开发分期

### Phase 1：Bug 修复 + 架构统一（预计 2-3 天）

> 目标：修掉关键 Bug，统一查重架构，为后续开发打好基础

#### 1.1 统一查重 service 层

**新建** `src/services/plagiarism-service.ts`：
- 合并 v1 service、v1 API、v2 API 的查重逻辑为一个统一的 service
- 通过配置对象控制检测层级：

```typescript
interface PlagiarismConfig {
  selfDuplication: boolean;    // 自引检测
  crossProject: boolean;       // 跨项目检测
  knowledgeBase: boolean;      // 知识库检测
  embeddingSemantic: boolean;  // Embedding 语义检测
  webSearch: boolean;          // 联网检测
  academicCliche: boolean;     // 学术套话检测
  thresholds: {
    self: number;              // 默认 0.25
    cross: number;             // 默认 0.2
    knowledge: number;         // 默认 0.2
    embedding: number;         // 默认 0.7
    web: number;               // 默认 0.18
  };
  maxMatches: number;          // 默认 50
  sampleThreshold: number;     // 长文本采样阈值，默认 60 段
}
```

- 默认配置 = v2 的检测层级（最全）
- 统一 `splitParagraphs`、`calcSimilarity`、`riskLevel` 等工具函数
- 修复 v2 `semanticMatches` 丢失 bug：将 Embedding 结果合并到 `matches`
- DB 写入改用 `prisma.plagiarismMatch.createMany`
- 统一阈值为配置项，不再硬编码

**删除/废弃**：
- `src/services/plagiarism-check.ts`（v1 service）→ 功能被新 service 覆盖
- `src/app/api/plagiarism/check/route.ts` → 改为调用新 service
- `src/app/api/plagiarism/v2/route.ts` → 改为调用新 service
- 清理 `similarity.ts` 中未使用的函数（`computeSimHash`、`hammingDistance` 等）

**改动文件**：
```
新建：src/services/plagiarism-service.ts
修改：src/app/api/plagiarism/check/route.ts（改为薄壳，调用 service）
修改：src/app/api/plagiarism/v2/route.ts（同上，或删除合并到 check）
修改：src/lib/similarity.ts（删除死代码）
修改：src/lib/validations.ts（确保 schema 完整）
```

#### 1.2 修复前端类型 + 联网参数

**修改** `src/app/plagiarism/page.tsx`：
- `MatchResult.matchType` 补全为 `"self" | "cross" | "local" | "web" | "ai"`
- `webSearch` 参数传递修正

**修改** `src/components/shared/plagiarism-panel.tsx`：
- 同上类型修正
- 联网搜索 checkbox 功能验证

#### 1.3 修复 v2 输入验证

**修改** `src/app/api/plagiarism/v2/route.ts`（或合并后的 route）：
- 接入 `validateBody(plagiarismCheckSchema, ...)` 替代手动 if 判断

#### 1.4 数据库补索引

**修改** `prisma/schema.prisma`：
- `PlagiarismMatch` 补 `@@index([checkId])`
- `RewriteSuggestion` 补 `@@index([checkId])`
- 其他 P3 级别的 `@@index` 一并补上

**执行** `npx prisma migrate dev`

#### 1.5 SSE 进度推送

**修改** `src/app/api/plagiarism/check/route.ts`：
- 改为 SSE 响应，分阶段推送进度：

```typescript
// 推送格式
{ type: "progress", stage: "self_dup", message: "正在检测自引..." }
{ type: "progress", stage: "cross_project", message: "正在跨项目比对..." }
{ type: "progress", stage: "knowledge", message: "正在知识库比对..." }
{ type: "progress", stage: "embedding", message: "正在语义分析..." }
{ type: "progress", stage: "web", message: "正在联网搜索..." }
{ type: "done", data: PlagiarismResult }
{ type: "error", message: string }
```

**修改** `src/app/plagiarism/page.tsx`：
- 使用 `EventSource` 或 `fetch` + SSE 解析，显示分阶段进度
- 进度条 + 当前阶段文案

**修改** `src/components/shared/plagiarism-panel.tsx`：
- 同上 SSE 支持

---

### Phase 2：降重系统重写（预计 2 天）

> 目标：4 种策略真正差异化，工作流闭环，质量可验证

#### 2.1 降重 prompt 重写

**新建** `src/lib/prompts/rewrite.ts`：

```typescript
export function buildRewritePrompt(
  strategy: RewriteStrategy,
  originalText: string,
  context?: string,
  domain?: string
): { system: string; user: string }
```

4 种策略的差异化指令：

**同义替换 (synonym)**：
- 替换关键词为同义词/近义词，保留句式结构
- 不改变句子顺序
- 不改变段落逻辑
- 专业术语可替换为英文缩写或全称

**改写语序 (rephrase)**：
- 调整句子结构（主动↔被动、陈述↔疑问）
- 拆分长句为短句，或合并短句为长句
- 保留关键用词
- 可调整段落内句子顺序

**概括精简 (summarize)**：
- 压缩冗余描述，保留核心信息
- 合并重复表述
- 去除不必要的修饰词
- 不丢失任何关键数据和结论

**扩写重组 (expand)**：
- 拆分复杂句子为多个简单句
- 补充逻辑连接词
- 重组论证顺序
- 可适当增加解释性内容

**通用约束**（所有策略共享）：
- 禁止编造数据
- 禁止改变学术结论
- 禁止删除引用标记 [1][2]
- 禁止引入新观点
- 保持学术语气
- 纯文本输出，禁止 Markdown
- 保持段落数量不变
- 长度变化不超过 ±20%

**接入领域知识**：使用已有的 `buildDomainExpertise` 注入农业科研领域角色

#### 2.2 降重服务层重写

**修改** `src/services/rewrite-service.ts`：
- 4 种策略并行调用 AI（`Promise.all`）
- 改写后自动计算与原文的相似度（使用 `similarity.ts` 的 `jaccardSimilarity`）
- 添加长度校验：改写结果与原文长度差 > 30% 时自动重试一次
- `parseResponse` 清理 Markdown 包裹、前缀说明、代码块标记
- 持久化失败时记录日志

#### 2.3 降重前端重做

**修改** `src/components/shared/plagiarism-panel.tsx` 的 `RewriteView`：
- 每个建议卡片添加"采纳"和"忽略"按钮
- "采纳"按钮：调用 PATCH API + 复制改写文本到剪贴板 + 高亮已采纳
- "批量降重"按钮：对所有高/中风险段落并行发起降重
- "全部采纳"按钮：一键接受所有建议
- 每个建议显示改写前后相似度对比（如 "相似度 85% → 32%"）
- 原文和改写文本的 diff 对比展示（可用简单的逐字高亮）

#### 2.4 降重后重新查重闭环

**修改** `src/app/plagiarism/page.tsx`：
- 降重 Tab 添加"应用改写并重新查重"按钮
- 点击后：将已采纳的改写应用到原文 → 自动切换到查重 Tab → 使用改写后文本发起查重
- 结果展示时对比前后两次查重的相似度变化

#### 2.5 数据模型补充

**修改** `prisma/schema.prisma`：

```prisma
model RewriteSuggestion {
  // 现有字段...
  createdAt         DateTime @default(now())     // 新增
  rewrittenSimilarity Float?                      // 新增：改写后预期相似度
}
```

**执行** `npx prisma migrate dev`

---

### Phase 3：审查系统开发（预计 3-4 天）

> 目标：4 维度全面审查，含学术诚信检测，有依据的评分

#### 3.1 类型定义

**新建** `src/types/review.ts`：

```typescript
// 审查问题类型
export type ReviewIssueType =
  | "slang" | "terminology" | "sentence" | "vague" | "formula"     // 学术规范
  | "evidence" | "logic" | "causality" | "overclaim" | "counter" | "criticism"  // 论证质量
  | "structure" | "figure_ref" | "reference_format" | "abstract" | "keywords"   // 结构规范
  | "fake_citation" | "data_inconsistency" | "stats_misuse" | "reproducibility" | "suspicious_result"; // 学术诚信

export type ReviewDimension = "academic" | "argument" | "structure" | "integrity";

export interface ReviewIssue {
  id: string;
  dimension: ReviewDimension;
  type: ReviewIssueType;
  severity: "high" | "medium" | "low";
  location: string;        // "第X节 / 表X / 图X"
  evidence: string;        // 证据锚点
  description: string;     // 问题描述
  suggestion: string;      // 改进建议
  originalText?: string;   // 原文片段
}

export interface DimensionResult {
  score: number;           // 0-100
  grade: "A" | "B" | "C" | "D";
  issueCount: number;
  breakdown: { high: number; medium: number; low: number };
  basis: string[];         // 打分依据
  issues: ReviewIssue[];
}

export interface ReviewReport {
  reviewId: string;
  synopsis: string;        // 论文概要 ≤150字
  summary: string;         // 总体评价 3-5句
  dimensions: {
    academic: DimensionResult;
    argument: DimensionResult;
    structure: DimensionResult;
    integrity: DimensionResult;
  };
  overallScore: number;    // 综合分（加权平均）
  overallGrade: "A" | "B" | "C" | "D";
  createdAt: string;
}
```

**新建** `src/contracts/review.ts`：

```typescript
export type IssueStatus = "open" | "fixing" | "fixed" | "dismissed";

export interface FixableReviewIssue extends ReviewIssue {
  status: IssueStatus;
  fixedContent?: string;
}

export interface FixableReviewReport extends Omit<ReviewReport, "dimensions"> {
  dimensions: {
    [K in ReviewDimension]: DimensionResult & {
      issues: FixableReviewIssue[];
    };
  };
}
```

#### 3.2 Prompt 开发

**新建** `src/lib/prompts/review-academic.ts`：
```typescript
export function buildAcademicReviewPrompt(content: string): { system: string; user: string }
```
角色：农业学术写作规范审查专家
检查点：口语化用词、术语一致性、句式规范、模糊表述、公式符号规范
输出：JSON 格式 issues 数组

**新建** `src/lib/prompts/review-argument.ts`：
```typescript
export function buildArgumentReviewPrompt(content: string): { system: string; user: string }
```
角色：学术论证质量审查专家
检查点：论点论据匹配、推理链完整性、因果合理性、overclaim、反面论证、文献批判性
输出：JSON 格式 issues 数组

**新建** `src/lib/prompts/review-structure.ts`：
```typescript
export function buildStructureReviewPrompt(content: string): { system: string; user: string }
```
角色：学术论文结构规范审查专家
检查点：IMRaD 章节完整性、图表引用一致性、参考文献格式、摘要四要素、关键词规范
输出：JSON 格式 issues 数组

**新建** `src/lib/prompts/review-integrity.ts`：
```typescript
export function buildIntegrityReviewPrompt(content: string, references?: string[]): { system: string; user: string }
```
角色：学术诚信审查专家
检查点：引用真实性（格式完整性、可疑引用标记）、数据内部一致性（正文 vs 图表 vs 结论交叉比对）、统计合理性（p值/样本量/置信区间自洽性）、方法可复现性（关键参数完整性）、结果合理性（数值范围、异常提升幅度）
输出：JSON 格式 issues 数组

**通用 prompt 设计原则**（参考 Ai-Review）：
- 证据锚点原则：每个问题必须引用具体位置（第X节/表X/图X）
- 不打分：每个维度只输出 issues，分数由代码计算
- JSON 输出：严格 JSON 格式，含三层容错解析
- 学术诚信维度特殊：需要交叉比对，prompt 中要求 AI 逐项核对并引用证据

**修改** `src/lib/prompts.ts`：re-export 4 个新 prompt 模块

#### 3.3 评分算法

**新建** `src/lib/review-scoring.ts`：

```typescript
export function calculateDimensionScore(issues: ReviewIssue[]): DimensionResult

// 评分逻辑：
// 基础分 100
// high: -15 分/个，medium: -8 分/个，low: -3 分/个
// 最低 0 分
// grade: A(90+) B(75-89) C(60-74) D(<60)
// basis: 自动生成扣分依据说明

export function calculateOverallScore(dimensions: Record<ReviewDimension, DimensionResult>): { score: number; grade: string }
// 加权平均：academic 25% / argument 35% / structure 15% / integrity 25%
// 论证质量和学术诚信权重最高
```

#### 3.4 服务层

**新建** `src/services/review-service.ts`：

```typescript
export interface ReviewOptions {
  projectId?: string;
  title: string;
  sections: { key: string; content: string }[];
  outline?: string;
  dimensions?: ReviewDimension[];
  target?: string;  // 投稿目标
}

// 4 维度并行调用
export async function runReview(options: ReviewOptions): Promise<ReviewReport>

// 内部流程：
// 1. 拼接全文内容
// 2. 根据 dimensions 数组，并行调用 AI（每个维度一次 callAINonStreaming）
// 3. 解析 4 份 JSON 结果
// 4. 合并 issues，计算各维度分数
// 5. 综合概要和总体评价（可用 AI 生成，也可从各维度拼接）
// 6. 持久化到 ReviewCheck + ReviewIssue 表
// 7. 返回完整报告

// 修复单个问题
export async function fixReviewIssue(
  issue: ReviewIssue,
  sectionContents: Record<string, string>,
  title: string
): Promise<AsyncGenerator<{ content?: string }>>  // SSE 流式

// 历史记录
export async function getReviewHistory(projectId?: string): Promise<ReviewCheck[]>
```

#### 3.5 API 路由

**新建** `src/app/api/review/route.ts`：
- POST：调用 `runReview`，返回 `ReviewReport`
- 输入验证：`validateBody(reviewSchema, ...)`
- 错误处理：使用统一的 `errorResponse()`

**新建** `src/app/api/review/fix/route.ts`：
- POST：调用 `fixReviewIssue`，SSE 流式返回修复内容
- 参考现有的 `api/consistency/fix/route.ts` 模式

**新建** `src/app/api/review/history/route.ts`：
- GET：返回审查历史记录

**新建** `src/lib/validations.ts` 中的 review schema：

```typescript
export const reviewSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1),
  sections: z.array(z.object({
    key: z.string(),
    content: z.string(),
  })).min(1),
  outline: z.string().optional(),
  dimensions: z.array(z.enum(["academic", "argument", "structure", "integrity"])).optional(),
  target: z.string().optional(),
});
```

#### 3.6 数据模型

**修改** `prisma/schema.prisma`：

```prisma
model ReviewCheck {
  id            String   @id @default(cuid())
  projectId     String?
  title         String
  content       String   // 审查的完整文本
  status        String   @default("pending")  // pending | running | done | failed
  overallScore  Float?
  overallGrade  String?  // A/B/C/D
  summary       String?  // 总体评价
  synopsis      String?  // 论文概要
  dimensions    String?  // JSON: 各维度得分和统计
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  issues        ReviewIssue[]

  @@index([projectId])
}

model ReviewIssue {
  id          String   @id @default(cuid())
  checkId     String
  check       ReviewCheck @relation(fields: [checkId], references: [id], onDelete: Cascade)

  dimension   String   // "academic" | "argument" | "structure" | "integrity"
  type        String   // 具体问题类型
  severity    String   // "high" | "medium" | "low"
  location    String?  // 问题所在位置
  evidence    String?  // 证据锚点
  description String   // 问题描述
  suggestion  String?  // 改进建议
  originalText String? // 原文片段

  status      String   @default("open")  // open | fixing | fixed | dismissed
  fixedContent String? // AI 修复后的内容
  createdAt   DateTime @default(now())

  @@index([checkId])
  @@index([dimension])
}
```

**执行** `npx prisma migrate dev`

#### 3.7 前端 Hook

**新建** `src/hooks/use-review.ts`：

```typescript
// 参考 useConsistency 的结构
export function useReview() {
  return {
    // 审查
    review: (options: ReviewOptions) => Promise<FixableReviewReport>,
    // 修复单个问题
    fixIssue: (index: number, ...) => Promise<void>,
    // 接受修复
    applyFix: (index: number) => void,
    // 忽略问题
    dismissIssue: (index: number) => void,
    // 状态
    report: FixableReviewReport | null,
    loading: boolean,
    progress: string,
    error: string | null,
  };
}
```

#### 3.8 前端页面

**新建** `src/app/quality/page.tsx`（或改造 `plagiarism/page.tsx`）：

```tsx
// 结构
<PageHeader title="论文质量检测" />
<Tabs defaultValue="plagiarism">
  <TabsList>
    <TabsTrigger value="plagiarism">🔍 查重</TabsTrigger>
    <TabsTrigger value="rewrite">✏️ 降重</TabsTrigger>
    <TabsTrigger value="review">📋 审查</TabsTrigger>
  </TabsList>

  <TabsContent value="plagiarism">
    {/* 现有查重逻辑，升级为 SSE 进度 */}
  </TabsContent>

  <TabsContent value="rewrite">
    {/* 现有降重逻辑，升级为完整工作流 */}
  </TabsContent>

  <TabsContent value="review">
    {/* 全新审查界面 */}
    <ReviewInput />          {/* 输入区：内容 + 投稿目标 + 维度选择 + 开始按钮 */}
    <ReviewScoreRing />      {/* 综合评分环形图 */}
    <ReviewDimensionCards />  {/* 4 张维度卡片，可展开看问题 */}
    <ReviewIssueList />      {/* 问题列表，每个问题可修复/忽略 */}
    <ReviewSynopsis />       {/* 论文概要 */}
    <ReviewSummary />        {/* 总体评价 */}
  </TabsContent>
</Tabs>
```

**新建组件**：
- `src/components/shared/review-report.tsx` — 审查报告主组件
- `src/components/shared/review-score-ring.tsx` — 评分环形图
- `src/components/shared/review-dimension-card.tsx` — 维度卡片
- `src/components/shared/review-issue-item.tsx` — 问题项（含修复/忽略按钮）

---

### Phase 4：联调 + 优化（预计 1-2 天）

#### 4.1 功能开关

**修改** `src/lib/feature-flags.ts`：
```typescript
export const featureFlags = {
  plagiarism: ...,
  review: process.env.NEXT_PUBLIC_ENABLE_REVIEW !== "false",
  // 可选：单独控制各维度
  reviewIntegrity: process.env.NEXT_PUBLIC_ENABLE_REVIEW_INTEGRITY !== "false",
};
```

#### 4.2 导航更新

**修改** 导航栏组件：
- `/plagiarism` → `/quality`（或保留路径，改标题为"论文质量检测"）
- 菜单项图标和文案更新

#### 4.3 Workbench 集成

**修改** `src/components/shared/plagiarism-panel.tsx`：
- 重命名为 `quality-panel.tsx`（可选）
- 增加审查 Tab 的快捷入口
- 从工作台编辑区直接传入内容进行审查

#### 4.4 全流程测试

- 用 3 篇不同方向的论文跑通：查重 → 降重 → 接受改写 → 重新查重 → 审查 → 修复
- 验证 SSE 进度推送正常
- 验证学术诚信维度能检测出引用格式异常、数据不一致等问题
- 验证评分逻辑和降级处理

#### 4.5 清理技术债

- 删除 `similarity.ts` 死代码
- 清理 `src/services/plagiarism-check.ts`（被新 service 替代）
- 统一 `any` 类型（顺带修 p1-1）
- 确保所有新 API 都接入了 `validateBody`（修 p1-2）

---

## 四、文件变更汇总

### 新建文件（Phase 1-4）

```
src/services/plagiarism-service.ts          -- 统一查重 service
src/services/rewrite-service.ts             -- 重写降重 service（原文件改造）
src/services/review-service.ts              -- 审查 service
src/lib/prompts/rewrite.ts                  -- 降重 prompt（从 service 中抽出）
src/lib/prompts/review-academic.ts          -- 学术规范审查 prompt
src/lib/prompts/review-argument.ts          -- 论证质量审查 prompt
src/lib/prompts/review-structure.ts         -- 结构规范审查 prompt
src/lib/prompts/review-integrity.ts         -- 学术诚信审查 prompt
src/lib/review-scoring.ts                   -- 评分算法
src/lib/review-parser.ts                    -- AI 响应解析（可复用 parseAIJson）
src/types/review.ts                         -- 审查基础类型
src/contracts/review.ts                     -- 审查前端契约
src/hooks/use-review.ts                     -- 审查 hook
src/app/quality/page.tsx                    -- 统一质量检测页面
src/app/api/review/route.ts                 -- 审查 API
src/app/api/review/fix/route.ts             -- 修复 API（SSE）
src/app/api/review/history/route.ts         -- 历史 API
src/components/shared/review-report.tsx     -- 审查报告组件
src/components/shared/review-score-ring.tsx -- 评分环形图
src/components/shared/review-dimension-card.tsx -- 维度卡片
src/components/shared/review-issue-item.tsx -- 问题项组件
```

### 修改文件

```
prisma/schema.prisma                        -- 新增 ReviewCheck + ReviewIssue + RewriteSuggestion 字段 + @@index
src/lib/validations.ts                      -- 新增 reviewSchema
src/lib/prompts.ts                          -- re-export rewrite + 4 个 review prompt
src/lib/similarity.ts                       -- 删除死代码
src/lib/feature-flags.ts                    -- 新增 review 开关
src/app/plagiarism/page.tsx                 -- 重构为 /quality，SSE 进度，类型修正
src/components/shared/plagiarism-panel.tsx  -- 降重按钮集成，类型修正，SSE 进度
src/app/api/plagiarism/check/route.ts       -- 改为调用统一 service
src/app/api/plagiarism/v2/route.ts          -- 合并到 check 或删除
src/app/api/plagiarism/rewrite/route.ts     -- 接入新 rewrite service
```

### 删除文件（可选）

```
src/services/plagiarism-check.ts            -- 被 plagiarism-service.ts 替代
src/app/api/plagiarism/v2/route.ts          -- 合并到 check/route.ts
```

---

## 五、开发顺序（建议）

```
Day 1-2:  Phase 1.1-1.3  统一查重 service + 修复 Bug + 类型修正
Day 2-3:  Phase 1.4-1.5  DB 索引 + SSE 进度推送
Day 3-4:  Phase 2.1-2.2  降重 prompt 重写 + 服务层重写
Day 4-5:  Phase 2.3-2.5  降重重前端 + 闭环 + 数据模型
Day 5-6:  Phase 3.1-3.4  审查类型 + Prompt + 评分 + 服务层
Day 6-7:  Phase 3.5-3.6  审查 API + 数据模型
Day 7-8:  Phase 3.7-3.8  审查前端 Hook + 页面 + 组件
Day 8-9:  Phase 4        联调 + 优化 + 清理
```

---

## 六、风险点

| 风险 | 影响 | 应对 |
|------|------|------|
| AI 输出 JSON 不稳定 | 审查结果解析失败 | 三层容错（直接解析 → code fence → fallback） |
| 4 维度并行 API 调用成本高 | token 消耗大 | 提供维度选择开关，用户可只选部分维度 |
| 学术诚信检测误报率高 | 错误标记正常内容为造假 | 标注为"可疑"而非"确认"，严重度从 low 开始 |
| 降重改写质量不稳定 | 改写后语义偏离 | 改写后自动计算相似度，偏差大时提示用户 |
| SSE 进度推送增加复杂度 | 前后端调试困难 | 保持简单的文本进度，不做复杂交互 |
