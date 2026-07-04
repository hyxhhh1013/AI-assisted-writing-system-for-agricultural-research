# 研究方向战略规划 — 设计方案 v3

> 创建：2026-07-04 | 修订：2026-07-04（v4 — 实验方案生成 + 经费申报集成 + 战线拉齐）| 状态：draft  
> 从"工具型写作辅助"升级为"研究方向战略规划 + 实验设计 + 项目申报"三位一体

## 1. 问题与目标

### 1.1 现状
- 实验室有四个明确研究方向：热化学、烟草、烟花、光与植物（植被×光化学交叉）
- 现有系统以「单篇论文」为单位工作：大纲生成、写作蓝图、扩写管道都是论文级的
- 每个方向的前期实验积累、已有论文、研究进展分散在 PDF 文献库和各写作项目中，缺乏方向级的全局视图
- 用户需要在开始写论文之前，先理解"这个方向已经做了什么、还能做什么、应该先写什么"

### 1.2 目标
在现有工具层之上新增「方向战略层」，实现六大能力：

| # | 能力 | 说明 |
|---|------|------|
| ① | **资产清点** | 结构化盘点实验基础、已发表论文、数据集 |
| ② | **缺口分析** | AI 识别研究空白和论文机会 |
| ③ | **论文路线图** | 方向级论文发表规划（优先级、时间线、数据依赖） |
| ④ | **实验方案生成** | 基于缺口分析，自动生成补充实验的方法学方案 |
| ⑤ | **项目申报辅助** | 从方向资产 + 路线图生成基金申请书核心章节 |
| ⑥ | **写作桥接** | 路线图→Blueprint→写作项目的无缝衔接 |

### 1.3 非目标
- 跨实验室协作
- 用户注册层面的方向隔离（后续按需加入）
- 实验设备物联网对接
- 经费财务实际管理（只做申报文本生成，不做账务）

### 1.4 v3 专题：从「可用」到「可信」

v1/v2 实现了数据流和功能完整性，但存在四个核心体验问题：

| # | 问题 | 根源 | v3 方案 |
|---|------|------|---------|
| 1 | **预承诺体验差** | 让科研人员填写 `what_triggers_block` 等技术字段 | Socratic Mentor 引导式对话 |
| 2 | **分析报告像 demo** | 8 个文字卡片，无图表，无证据链 | 专业报告：雷达图 + 证据追溯表 + 矛盾热力图 + 甘特图 |
| 3 | **缺少双角色** | 所有人看到同一界面 | PI（管理方向）vs Researcher（执行写作） |
| 4 | **写作桥接薄弱** | Blueprint 缺方向上下文 | 扩展 WritingBlueprint + 信息对齐审计 |

---

## 2. 核心设计决策

### 2.1 方向 = 知识库分类 + α
- `Direction.categories: string[]` 映射到现有 `KnowledgeFile.category`
- 文献数量、索引状态、分类分布全部自动读取，不重复录入
- 一个方向可以跨多个知识库分类（如"光与植物"跨茶学+控释肥类）
- **边界情况**：知识库分类粒度可能不完全匹配方向划分。Phase 0 方向配置时需展示现有分类列表 + 各分类的 PDF 数量，让用户明确映射关系。若将来分类粒度过粗，可考虑方向级别的 tags 补充。

### 2.2 结构化资产，而非自由文本
- 每项资产有固定字段，按类型（experiment / paper / dataset）有不同 schema
- 人填写关键字段（研究问题、关键发现、局限），AI 基于结构化数据做分析
- 资产间建立关联（实验→数据集→论文）

### 2.3 分阶段管线 + Rubric 驱动评分（v2 已实现）
- 借鉴 academic-paper skill 的 Phase 结构 + v3.6.6 Generator-Evaluator Contract Protocol
- 每阶段有命名产出物和用户确认门禁
- **Rubric 驱动**：每个维度有 3-5 条具体检查项（RubricItem），AI 逐条回应 + 证据锚定
- **合成阶段**：独立 AI 调用检测跨维度矛盾（D4↔D5、D2↔D1、D7↔D3）
- **Verifier 交叉验证**：D3/D5 启用 Zhipu 独立审查
- **D5 输出校验**：D4×D5 tier 一致性检查 + journal-metrics 匹配 + 去重

### 2.4 Socratic 预承诺（v3 新增，P0）
- **借鉴**：academic-paper Plan Mode 的 Socratic Mentor 模式
- **旧方案**：用户填写 8 个维度的 `what_triggers_block` / `what_triggers_warn`（不合理）
- **新方案**：系统用自然语言提问 → AI 翻译为 Rubrics → 用户确认
  - Q1: "你实验室这个方向通常投什么层次的期刊？"
  - Q2: "在你的领域，实验最少重复几次才能发表？"
  - Q3: "你计划未来 2 年发表几篇论文？"
  - Q4: "哪些子方向是你的核心优势？"
  - Q5: "你的实验室优势是什么？（数据积累 / 方法独特 / 设备领先 / 交叉学科）"
  - Q6: "过去被退稿的主要原因是什么？"

### 2.5 专业报告可视化（v3 新增，P0）
- 现状：8 个折叠卡片 + 文字列表，无法建立信任感
- 目标：一份可导出的专业分析报告

| 图表 | 用途 | 技术方案 |
|------|------|----------|
| 🕸️ 雷达图 | 8 维度评分概览，含基准线对比 | Python matplotlib / recharts |
| 📊 柱状图 | 论文候选按 Tier 分组 + 加权总分 | Python matplotlib / recharts |
| 📅 甘特图 | 论文时间线 + 实验依赖 | 前端组件 |
| 📋 证据追溯表 | 每条 Rubric → 资产 ID + 字段值 + 通过/不通过 | 可展开表格组件 |
| 🔴 矛盾热力图 | D4↔D5 等跨维度一致性问题 | 颜色编码面板 |
| 📈 历史趋势 | 多次分析结果对比 | 折线图 |

- **复用**：本项目已有 Python matplotlib 图表生成管道（`POST /api/chart`），雷达图和柱状图可复用此管道
- **前端**：recharts 库（纯前端渲染，无需后端）用于简单图表；复杂图表走 Python 管道

### 2.6 双角色架构（v3 新增，P2）
- 借鉴现有 `admin` 角色体系，增加 `pi` 角色（或复用 admin）
- 权限分两级，不需要复杂 RBAC

| 权限 | PI（方向负责人） | Researcher（研究生/博士生） |
|------|------------------|--------------------------|
| 方向管理 | 创建/编辑/归档方向、设置评价标准 | 查看自己所属方向概览 |
| 资产录入 | 审核资产、全局视角 | 录入自己负责的实验和数据 |
| 分析触发 | 触发/批准分析、锁定结果 | 只读查看 |
| 论文路线图 | 制定/调整、分配论文 | 查看被分配的论文、标注进度 |
| 跨方向 | 全局 dashboard 看全部方向 | 仅自己方向 |

### 2.7 Blueprint 扩展（v3 新增，P1）
- 现状：WritingBlueprint 只有结构信息（章节引导、配图计划），缺少方向上下文
- 问题：AI 知道"写什么结构"，但不知道"为什么要写"和"有什么数据支撑"
- 新增字段：

| 字段 | 来源 | 用途 |
|------|------|------|
| `researchDirection` | `Direction.slug` | 关联方向，用于检索和分类 |
| `motivationFromGap` | D3 维度摘要 | 扩写时解释"为什么写这篇论文" |
| `dataBasis` | `PaperCandidate.dataBasis` | 扩写时引用具体实验数据 |
| `targetJournal` | `PaperCandidate.suggestedJournal` | 匹配期刊风格和格式 |
| `pendingExperiments` | `PaperCandidate.requiredExperiments` | 写作中标注"此处需补实验数据" |

### 2.8 NL 资产解析（v3 新增，P1）
- **借鉴**：academic-paper Revision Coach（解析非结构化审稿评语为结构化 Revision Roadmap）
- **应用**：用户写一段自然语言"我们 2024 年做了管式炉热解实验，CO₂ 气氛下..."→ AI 解析为结构化 ExperimentAsset（title、researchQuestion、keyFindings、limitations 等字段预填，用户审核后保存）

### 2.9 Style Calibration 方向校准（v3 新增，P2）
- **借鉴**：academic-paper v2.5 Style Calibration（从 3+ 篇已发表论文学习写作风格）
- **应用**：从方向下已发表的论文中学习"什么样的实验组合能支撑一篇好论文"，用于校准 D4/D5 评分标准

### 2.10 Material Passport 版本追踪（v3 新增，P2）
- **借鉴**：academic-pipeline Material Passport（跨阶段状态追踪）
- **应用**：每次分析→路线图→创建项目形成版本链。当资产变更或评分标准变更时，系统明确告知"路线图是否仍然有效"

### 2.11 实验方案生成（v4 新增，P1）

**问题**：D6 维度识别了"需补实验"，路线图标记了实验依赖关系，但研究者还需要具体的实验方案——用什么方法、什么条件、预期结果。

**方案**：基于方向已有的实验资产（作为模板/参考）+ D6 缺口描述 + 知识库文献中的方法学片段，AI 生成结构化实验方案。

**输入**：
- D6 维度："需补充 SEM 表征实验以确认催化剂积碳形貌"
- 方向已有实验资产列表（提供实验室常用方法模板）
- 知识库中相关文献的方法学片段（RAG 检索）

**产出** — 结构化实验方案：
```typescript
interface ExperimentPlan {
  id: string;
  title: string;                    // 实验名称
  objective: string;                // 实验目的（对应 D6 的哪条缺口）
  rationale: string;                // 为什么需要做这个实验
  methods: ExperimentPlanMethod[];  // 方法步骤
  expectedResults: string;          // 预期结论
  equipmentNeeded: string[];        // 所需仪器
  sampleRequirements: string;       // 样品要求
  estimatedDuration: string;        // 预估周期
  keyReferences: string[];          // 方法学参考文献
  linkedPaperCandidateIds: string[]; // 服务于哪篇论文候选
}
```

**生成管道**：
1. 用户点击 D6 维度中某条缺口旁边的「生成实验方案」
2. 系统组装上下文：缺口描述 + 方向已有实验方法字段 + RAG 检索相关文献方法学段落
3. AI 生成结构化 ExperimentPlan
4. 用户审核/编辑/确认 → 保存到 `Direction.experimentPlans` JSON 字段

**与资产的关系**：生成的实验方案可以一键转为 ExperimentAsset（当实验完成后），形成"计划→执行→资产"的闭环。

### 2.12 项目申报辅助（v4 新增，P1）

**问题**：方向战略规划产出了完整的研究图景（做了什么、缺什么、打算做什么），这本质上就是一份基金申请书的核心素材。目前这些信息分散在方向工作台的各个 Tab 中，没有被整合为申报材料。

**方案**：新增「申报材料」Tab/模式，将方向资产 + 分析结果 + 路线图组装为基金申请书结构。

**申请书结构映射**：

| 基金申请书章节 | 数据来源 | 内容 |
|---------------|----------|------|
| **立项依据与研究意义** | `Direction.description` + D3 缺口分析 | 领域背景 + 研究空白 + 为什么重要 |
| **研究内容** | `PaperCandidate[]`（Tier=ready/needs_experiment） | 拟开展的研究课题分解 |
| **研究目标** | `DirectionRoadmap` | 总体目标和阶段性目标 |
| **技术路线** | 路线图时间线 + 实验方案 | 研究方法、技术路线图 |
| **研究基础** | `Direction.assets` + D1 已有基础盘点 | 已发表论文列表、实验积累、设备条件 |
| **可行性分析** | D4 数据质量 + D7 创新性 | 数据基础 + 团队优势 |
| **预期成果** | `PaperCandidate[]` + 路线图 | 论文/专利/软著数量预测 |
| **经费预算** | 实验方案 `equipmentNeeded` + `sampleRequirements` | 经费估算（仅文本，不做财务） |

**生成模式**：
- **快速模式**：用户选择目标基金类型（国自然面上/青年/地区/省基金/开放课题），AI 基于已有数据生成申请书全文草稿
- **章节模式**：逐章节生成，用户逐步审核修改

**产出格式**：
- Markdown（可导出为 DOCX）
- 自动套用实验室历史项目的格式模板

**不做的**：
- 实际经费账务管理
- 申报系统 API 对接
- 合作单位/人员管理

---

## 3. 数据模型

### 3.1 Prisma 表：Direction（v2 已实现，v3 不变）

```prisma
model Direction {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  categories  String[]
  status      String   @default("active")
  assets      Json?
  analysis    Json?
  roadmap     Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
}
```

### 3.2 资产类型（v2 已实现，v3 不变）

```typescript
interface ExperimentAsset {
  id: string;
  kind: "experiment";
  title: string;              // 必填
  dateRange: string;
  researchQuestion: string;   // 必填
  methods: string;
  keyFindings: string;        // 必填
  limitations: string;        // 必填
  isNegativeResult: boolean;
  linkedDatasets: string[];
  linkedPapers: string[];
  createdAt: number;
  updatedAt: number;
}

interface PaperAsset {
  id: string;
  kind: "paper";
  doi: string;                // 必填
  title: string;
  journal: string;
  year: number;
  impactFactor?: number;
  abstract: string;
  contribution: string;       // 必填
  linkedExperiments: string[];
  source: "manual" | "knowledge_base" | "existing_project";
  createdAt: number;
  updatedAt: number;
}

interface DatasetAsset {
  id: string;
  kind: "dataset";
  title: string;
  filePath?: string;
  variables: string;          // 必填
  sampleSize?: string;
  linkedExperiments: string[];
  source: "manual" | "existing_data_claims";
  createdAt: number;
  updatedAt: number;
}
```

### 3.3 Rubric 类型（v2 已实现）

```typescript
interface RubricItem {
  id: string;                  // "D1.1"
  what_to_look_for: string;    // 检查点
  what_triggers_block: string; // 硬性阻挡条件
  what_triggers_warn: string;  // 软性提醒条件
  evidence_required: string;   // 需要什么证据
}

interface RubricResponse {
  rubricId: string;
  passed: boolean;
  evidence: string[];          // ["exp-001: sampleSize=5", ...]
  explanation: string;
}
```

### 3.4 分析 / 路线图类型（v2 已实现，v3 不变）

```typescript
interface AnalysisDimension {
  id: string;
  name: string;
  weight: number;
  score: number;
  summary: string;
  whatTriggersBlock: string;
  whatTriggersWarn: string;
  confidence: "high" | "medium" | "low";
  rubricResponses?: RubricResponse[];
}

interface SynthesisResult {
  contradictions: Array<{
    pair: [string, string];
    severity: "high" | "medium" | "low";
    description: string;
    resolution: string;
    adjustedScores: Record<string, number>;
  }>;
  harmonizedScore: number;
  summary: string;
}

interface DirectionAnalysis {
  generatedAt: number;
  analysisFingerprint: number;
  dimensions: AnalysisDimension[];
  paperCandidates: PaperCandidate[];
  crossDirectionOpportunities: CrossDirectionOpportunity[];
  synthesis?: SynthesisResult;
  evaluationContract?: {
    dimensions: Array<{
      id: string;
      name: string;
      weight: number;
      rubrics: RubricItem[];
    }>;
    confirmedAt: number;
  };
}

interface DirectionRoadmap { /* ... */ }
```

### 3.5 WritingBlueprint 扩展字段（v3 新增）

```typescript
// 在现有 WritingBlueprint 接口上增加：
interface WritingBlueprintV3 extends WritingBlueprint {
  // v3 方向上下文字段
  researchDirection?: string;           // Direction.slug
  motivationFromGap?: string;           // D3 缺口描述
  dataBasis?: string[];                 // 支撑数据清单
  targetJournal?: string;               // 目标期刊
  pendingExperiments?: string[];        // 需补实验清单
  roadmapCandidateId?: string;          // 关联的 PaperCandidate.id
}
```

---

## 4. 分阶段管线（v2 已实现，v3 增强 Phase 2）

### Phase 0：方向配置（v2 已实现）
- 创建/编辑方向，关联知识库分类
- 展示知识库已有分类列表 + PDF 数量

### Phase 1：资产盘点（v2 已实现 + v3 NL 解析增强）
- 结构化表单录入 + 扫描导入
- **v3 新增**：「自由描述」模式——用户写一段自然语言，AI 解析为结构化资产

### Phase 2：Socratic 预承诺（v3 重设计，P0）
- **旧**：用户填写 8 个维度的 block/warn 条件
- **新**：Socratic Mentor 引导式对话
  1. 系统依次问 5-6 个自然语言问题（期刊层次、样本量要求、论文数量目标、核心优势方向、实验室优势、退稿原因）
  2. AI 将答案翻译为 8 维度 Rubrics 草案
  3. 用户逐项审核/微调、确认
- **借鉴**：academic-paper Plan Mode 的 4 种问题类型（边界澄清 / 假设暴露 / 证据要求 / 收敛确认）

### Phase 3：8 维度分析（v2 已实现 + v3 图表增强）
- Rubric 驱动评分 + Verifier 交叉验证 + D5 输出校验
- 合成阶段：跨维度矛盾检测
- **v3 新增**：分析报告可视化（雷达图、证据追溯表、矛盾热力图）

### Phase 4：论文路线图（v2 已实现 + v3 甘特图增强）
- 论文优先级排序 + 时间线 + 实验依赖
- **v3 新增**：甘特图可视化

### Phase 5：桥接写作（v2 已实现 + v3 Blueprint 扩展）
- 一键创建写作项目 + 生成扩展版 WritingBlueprint
- Blueprint 携带方向上下文（研究缺口、数据支撑、目标期刊、补实验清单）

---

## 5. 8 维度分析框架（不变）

| ID | 维度 | 权重 | 核心问题 |
|----|------|------|----------|
| D1 | 已有基础盘点 | 15% | 实验/论文按子方向分布如何？ |
| D2 | 研究问题框架 | 15% | 以研究问题为线索串联资产 |
| D3 | 研究缺口识别 | 15% | 文献有但实验室没做的？做了没写的？ |
| D4 | 数据质量与充分性 | 15% | 每项实验数据能支撑多少结论？ |
| D5 | 论文机会排序 | 15% | 已有数据能写哪些论文？优先级？ |
| D6 | 实验补全路线 | 10% | 高优论文需补什么实验？ |
| D7 | 创新性与竞争分析 | 10% | 在领域中的独特优势？是否太卷？ |
| D8 | 跨方向协同机会 | 5% | 其他方向的方法/数据能否复用？ |

---

## 6. 反模式清单

> **v3 调整**：以下反模式检测逻辑的实现位置从方向规划模块移至系统已有审查板块（`review-service.ts` / `POST /api/review`），作为论文质量审查的一个维度。方向规划模块仅保留分析阶段的内置校验（D4×D5 一致性、候选去重、期刊匹配）。

| # | 反模式 | 检测位置 |
|---|--------|----------|
| 1 | AI 替人判断实验价值 | 审查板块（checkClaimSupport） |
| 2 | 虚构研究缺口 | 审查板块（checkGapValidity） |
| 3 | 夸大数据充分性 | 审查板块（checkDataSufficiency） |
| 4 | 论文候选重复 | 方向规划 Phase 3 内置校验 |
| 5 | D4×D5 tier 不一致 | 方向规划 Phase 3 内置校验 |
| 6 | 跳过用户确认门禁 | 方向规划 Phase 管线门禁 |
| 7 | 资产变更不刷新分析 | 方向规划 `analysisFingerprint` |
| 8 | 忽略负结果 | 方向规划资产表单 |

---

## 7. 操作模式

| 模式 | 触发 | 行为 |
|------|------|------|
| `full` | 首次分析 | Phase 0→5 完整管线 |
| `quick` | "快速评估" | 跳过 Phase 2，用默认 Rubrics |
| `gap-only` | "只看缺口" | Phase 3 只运行 D1/D2/D3/D8 |
| `roadmap-refresh` | 资产变更后 | 增量更新 Phase 3→4 |
| `roadmap-only` | "只看路线图" | 仅展示已有 roadmap |

---

## 8. 失败路径

| 场景 | 检测条件 | 处理策略 |
|------|----------|----------|
| 资产不足 | assets.length < 3 | 提示补录，分析按钮灰掉 |
| 方向文献贫瘠 | 知识库分类 PDF < 10 | Phase 3 标注"文献基础薄弱，缺口分析置信度低" |
| 无研究问题 | 所有实验 researchQuestion 为空 | Phase 2 阻断——要求至少填写 1 个 |
| 评价标准未确认 | Phase 2 未完成 | Phase 3 提示先确认标准（quick 模式除外） |
| 分析结果不批准 | 用户拒绝 | 可编辑后重新生成 |
| 路线图不可行 | 全部需补实验且周期 > 2 年 | 提示重新评估优先级 |
| 跨方向协同不确定 | D8 评分 < 3 | 标注"待人工判断" |

---

## 9. 与现有系统集成点

| 集成点 | 方式 |
|--------|------|
| 知识库文献统计 | `Direction.categories[]` → `KnowledgeFile.category` |
| RAG 检索 | `localRAG.search()` 按 categories 范围检索 |
| AI 调用 | `callAI()` + `callAINonStreaming()`（现有） |
| Verifier 跨模型 | `getAgentModelConfig("verifier")` → Zhipu（现有） |
| 写作蓝图 | 扩展 `WritingBlueprint` 接口 + `POST /api/outline/blueprint` |
| 项目系统 | Roadmap 论文 → `POST /api/projects` → 工作台 |
| 期刊指标 | `KnowledgeFile.metrics`（已有） |
| 导航 | `/directions` → 非 full-bleed 页面 + home-top-bar + PageHeader |
| UI 组件 | Shadcn + siteTheme + TabPanelShell |
| 图表管道 | `POST /api/chart`（Python matplotlib） + recharts（前端） |

---

## 10. 代码结构（现有 + v3 新增）

```
src/contracts/direction.ts              ✅ 已实现
src/services/direction.ts               ✅ 已实现
src/hooks/use-direction-analysis.ts     ✅ 已实现
src/hooks/use-direction-socratic.ts     🆕 Socratic 预承诺对话状态
src/lib/prompts/direction.ts            ✅ 已实现
src/lib/prompts/direction-socratic.ts   🆕 Socratic 问题生成 + 答案→Rubric 翻译

src/app/directions/
  page.tsx / directions-page-client.tsx  ✅ 已实现
  [slug]/
    page.tsx / direction-page-client.tsx ✅ 已实现（v3 重写预承诺 Tab）

src/app/api/directions/
  route.ts / [slug]/route.ts            ✅ 已实现
  [slug]/assets/route.ts                ✅ 已实现
  [slug]/scan/route.ts                  ✅ 已实现
  [slug]/evaluation-contract/route.ts   🔄 v3 增加 socratic 模式
  [slug]/analyze/route.ts               ✅ 已实现
  [slug]/roadmap/route.ts               ✅ 已实现
  summary/route.ts                      ✅ 已实现

src/components/shared/direction/
  direction-card.tsx                    ✅ 已实现
  direction-stat-cards.tsx              ✅ 已实现
  direction-asset-form.tsx              🔄 v3 增加 NL 输入模式
  direction-asset-list.tsx              ✅ 已实现
  direction-asset-scan-dialog.tsx       ✅ 已实现
  direction-analysis-panel.tsx          🔄 v3 重写为报告视图
  direction-analysis-charts.tsx         🆕 雷达图 + 柱状图组件
  direction-synthesis-panel.tsx         🆕 矛盾面板
  direction-dashboard.tsx               ✅ 已实现
  direction-roadmap-timeline.tsx        🔄 v3 增加甘特图
  direction-socratic-dialog.tsx         🆕 Socratic 对话组件

src/components/home/
  directions-overview.tsx               ✅ 已实现

scripts/seed-directions.mjs             ✅ 已实现
```

---

## 11. 实施计划

### Phase 1：v1/v2 已完成 ✅
- Direction 表 + 基础 CRUD
- 资产录入（结构化表单 + 扫描导入）
- Rubric 驱动 8 维度分析 + SSE
- 论文路线图生成 + 时间线
- 写作桥接（创建项目 + Blueprint）
- 主页概览卡片 + 种子脚本

### Phase 2：P0 — 可信度提升（第一优先级，打通用户信任）

| PR | 内容 | 估时 | 依赖 |
|----|------|------|------|
| **ENG-PR-110** | Socratic 预承诺：自然语言引导对话替代字段填写 + AI 翻译为 Rubrics | 2-3d | — |
| **ENG-PR-111** | 分析报告可视化：雷达图 + 证据追溯表 + 矛盾热力图 + 柱状图 | 3-4d | — |
| **ENG-PR-112** | 甘特图路线图可视化：时间线 + 实验依赖关系图 | 1-2d | ENG-PR-111 |

### Phase 3：P1 — 深度体验（写作桥接 + 资产智能录入）

| PR | 内容 | 估时 | 依赖 |
|----|------|------|------|
| **ENG-PR-113** | Blueprint 扩展（5 个方向上下文字段）+ 写作桥接信息对齐审计 | 1-2d | — |
| **ENG-PR-114** | NL 资产解析：自然语言→结构化 ExperimentAsset（借鉴 Revision Coach） | 1-2d | — |
| **ENG-PR-115** | 实验方案生成：D6 缺口→结构化 ExperimentPlan + 一键转资产 | 2-3d | — |
| **ENG-PR-116** | 项目申报辅助：方向资产+路线图→基金申请书核心章节（国自然等） | 3-4d | ENG-PR-115 |

### Phase 4：P2 — 架构完善（角色 + 追溯 + 校准）

| PR | 内容 | 估时 | 依赖 |
|----|------|------|------|
| **ENG-PR-117** | 双角色架构：PI + Researcher 权限分离（对齐现有 admin 体系） | 2-3d | — |
| **ENG-PR-118** | Material Passport 版本追踪：分析→路线图→项目决策链 | 1-2d | — |
| **ENG-PR-119** | Style Calibration 方向校准：从历史成功论文学习评分标准 | 2d | — |

### 反模式检测独立 PR

| PR | 内容 | 估时 | 所属模块 |
|----|------|------|----------|
| **ENG-PR-120** | 方向论文反模式检测接入审查板块（借鉴 academic-paper 反模式清单） | 1-2d | `review-service.ts` |

### 总估时

| Phase | PR 数 | 总估时 |
|-------|-------|--------|
| P0 (可信度) | 3 | 6-9d |
| P1 (深度体验) | 4 | 8-11d |
| P2 (架构完善) | 3 | 5-7d |
| 反模式 | 1 | 1-2d |
| **合计** | **11** | **20-29d** |

---

## 12. 借鉴来源

| 模式 | 来源 | 应用位置 |
|------|------|----------|
| Socratic Mentor | academic-paper Plan Mode | Phase 2 预承诺 |
| Rubric 驱动评分 + 预承诺 | academic-paper v3.6.6 Generator-Evaluator Contract | Phase 3 分析 |
| Verifier 交叉验证 | 现有 writing pipeline Writer/Verifier | Phase 3 D3/D5 |
| Revision Coach（NL 解析） | academic-paper Revision Coach | Phase 1 资产录入 |
| Style Calibration | academic-paper v2.5 | 方向评分标准校准 |
| Material Passport | academic-pipeline | 分析版本链 |
| 反模式检测 | 现有 review-service.ts | 审查板块 |
| 图表管道 | 现有 `POST /api/chart`（Python matplotlib） | 分析报告可视化 |
