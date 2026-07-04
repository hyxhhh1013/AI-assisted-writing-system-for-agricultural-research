# 研究方向战略规划 — 重构方案 v2

> 创建：2026-07-04 | 基于 academic-paper v3.6.6 设计模式重建  
> 核心变更：固定 4 方向 + 预承诺协议 + rubric 驱动评分 + 合成校验

---

## 0. 为什么重建

v1 的四个根因导致系统"只是个 demo"：

| 根因 | v1 表现 | academic-paper 模式 |
|------|---------|-------------------|
| 无 rubrics | "7 分"没有定义，AI 自由发挥 | Scoring Plan：每维度 4 字段（what_to_look_for / block / warn / evidence_required） |
| 无预承诺 | AI 看到资产后才定标准 → 迎合数据 | Phase 4a/6a paper-blind pre-commitment |
| 无合成 | D4 说"数据不足"，D5 说"可写 3 篇" | Phase 6b Failure Condition Checks + 跨维度一致性 |
| 单模型 | 同一模型打分+验证，自我审查无效 | Writer(DeepSeek) + Verifier(Zhipu) 不同模型独立审查 |

---

## 1. 固定 4 方向设计

### 1.1 不提供方向创建/删除

```
研究室 4 个方向：
┌──────────┬──────────────┬──────────────┐
│ 热化学    │ 烟草          │ 烟花          │ 光与植物      │
│ 热化学·热解│ 烟草          │ 烟花          │ 茶学·控释肥类  │
│ ~80+ PDF  │ ~30+ PDF     │ ~20+ PDF     │ ~40+ PDF      │
└──────────┴──────────────┴──────────────┘
```

- Direction 表在 seed 中初始化 4 行
- slug 固定：`thermochemistry` / `tobacco` / `fireworks` / `light-plants`
- categories 预绑定知识库分类
- 用户只能：编辑方向描述、录入资产、触发分析、查看路线图
- 归档操作保留（可能某个方向暂停），但不删除

### 1.2 方向列表 → 仪表盘

主页 `/` 的 DirectionsOverview section 就是唯一的"方向列表"。点击卡片进入 `[slug]` 工作台。移除 `/directions` 创建/删除路径——这个页面退化为只读状态面板。

---

## 2. 新的分析管线（5 Phase）

```
Phase 0: 资产盘点     → 手工录入 + 从知识库扫描
Phase 1: 预承诺 1a    → AI 盲态（只看方向名）输出 Rubrics 草案
Phase 2: 预承诺 1b    → 用户确认/修改 Rubrics → 锁定为 Contract
Phase 3: 8 维度分析   → Writer(DeepSeek) 逐维度评分（temperature=0，逐条回应 Contract）
                      → 合成阶段：跨维度矛盾检测 + 修正
                      → Verifier(Zhipu) 审查 D3/D5（可选）
Phase 4: 论文路线图   → 基于确认的分析结果生成优先级+时间线
                      → 一键创建写作项目
```

**关键变化**：
- Phase 1 拆成 1a（盲态 AI draft）和 1b（用户确认），对齐 academic-paper Phase 4a/4b
- 原 Phase 0（方向配置）移除——方向固定
- 分析后加合成阶段，对齐 academic-paper Phase 6b Failure Condition Checks

---

## 3. Rubric 驱动的评分系统

### 3.1 每个维度的 Contract 四字段

```
D4（数据质量与充分性）：
  what_to_look_for:
    1. 每项实验的样本量（n）是否 ≥ 3
    2. 是否报告了效应量（effect size）或置信区间
    3. 关键结论是否可追溯到具体数据行
    4. 数据缺失模式是否存在系统性偏差

  what_triggers_block:
    任一项关键实验 n < 3 且无统计检验方法说明

  what_triggers_warn:
    ≥ 50% 的实验未报告效应量或置信区间

  evidence_required:
    引用具体实验 ID 和该实验的 sampleSize/variables 字段
```

### 3.2 Prompt 要求逐条回应

Writer 的输出格式从自由文本变为：

```json
{
  "dimensionId": "D4",
  "score": 6,
  "confidence": "medium",
  "rubricResponses": [
    {
      "criterion": "样本量 ≥ 3",
      "passed": false,
      "evidence": ["exp-001: n=2, 无统计检验说明"],
      "explanation": "高温裂解实验 2024Q1 仅 2 次重复，缺少方差分析"
    },
    {
      "criterion": "效应量报告",
      "passed": false,
      "evidence": ["exp-002: 未报告效应量", "exp-003: 未报告效应量"],
      "explanation": "5 项实验中 4 项未报告效应量"
    }
  ],
  "synthesis": "该方向实验数据整体偏弱：2/5 实验样本量不足，4/5 未报告效应量。在补足统计检验前，不适宜投稿高 IF 期刊。"
}
```

### 3.3 temperature=0

所有分析调用 `callAINonStreaming` 显式设 `temperature: 0`。同输入 → 同输出。

---

## 4. 合成阶段（Synthesis）

### 4.1 跨维度矛盾检测

8 维度完成后，增加一个 synthesis prompt。其任务：

1. **读取 8 维度结果**，识别矛盾对：
   - D4 说"数据不足"但 D5 说"可立即写 3 篇" → 标记矛盾
   - D3 说"缺口 > 50%"但 D7 说"领域热点已转移" → 可能一致，不标记
2. **输出修正建议**：
   - 对每个矛盾对，降低或升高相关维度评分
3. **输出一致的综合评分**（加权后）

### 4.2 合成输出

```json
{
  "contradictions": [
    {
      "pair": ["D4", "D5"],
      "description": "D4 判定数据不足以支撑结论，但 D5 判定 3 篇论文可立即启动",
      "resolution": "将 D5 的 ready 论文数从 3 降至 0，重新评级为 needs_experiment",
      "adjustedScores": { "D4": 4, "D5": 3 }
    }
  ],
  "harmonizedScore": 4.8,
  "summary": "该方向当前核心瓶颈是实验数据质量..."
}
```

---

## 5. 知识库真正接入

### 5.1 分析时注入文献上下文

```
Phase 3 启动时：
  1. 提取资产的 keyFindings + researchQuestion → 构建检索查询
  2. 用本地 RAG (localRAG.search) 按 Direction.categories 范围检索
  3. 对每个维度，注入相关文献的摘要/结论/方法作为 literatureContext
```

### 5.2 D3（研究缺口识别）专用

D3 的 prompt 额外注入：
- 知识库中已有文献的研究主题分布（按 category 统计高频术语）
- 资产中已覆盖的研究问题列表
- 对比后输出：文献有但资产未覆盖的方向

---

## 6. 论文候选改进

### 6.1 D5 输出校验

D5 输出的每个 PaperCandidate 在保存前校验：

| 检查项 | 方法 |
|--------|------|
| suggestedJournal 是否在 journal-metrics 中存在 | 查 KnowledgeFile.metrics |
| tier 是否与 D4 数据质量评分一致 | ready 要求 D4 ≥ 5 |
| requiredExperiments 是否在资产中存在对应实验 | 匹配 ExperimentAsset.title |

### 6.2 与 D4 联动

D4 的结果传入 D5 prompt：
```
D4 评分: 4/10
D4 判定: 5 项实验中 2 项样本量不足，4 项未报告效应量
→ 基于此，你的论文候选 tier 判定必须保守：任何依赖这 5 项实验的论文最高为 needs_experiment
```

---

## 7. 简化的 UI 结构

```
主页 (/)
├── HomeHero
├── DirectionsOverview（4 张固定卡片，无需新建入口）
└── HomeModuleSections

方向工作台 (/directions/[slug])
├── 仪表盘（大数字 + 进度条 + 下一步提示）
├── Tab: 资产盘点（Phase 0）
├── Tab: 预承诺（Phase 1a + 1b）
├── Tab: 8 维度分析（Phase 3）
├── Tab: 论文路线图（Phase 4）
```

移除：
- `/directions` 创建/列表页面（被主页 DirectionsOverview 替代）
- Tab "方向配置"（方向固定，描述编辑合并到仪表盘顶部）
- "新建方向"按钮

---

## 8. 实施顺序

| PR | 内容 | 估时 |
|----|------|------|
| ENG-PR-104 | Direction seed 数据（4 个固定方向 + 分类绑定）+ 移除创建/删除 UI | 0.5d |
| ENG-PR-105 | Rubric 系统：Phase 1a/1b 预承诺 + Contract 四字段 + prompt 重构 | 1.5d |
| ENG-PR-106 | 合成阶段 + temperature=0 + Verifier 接入 + 知识库 RAG 注入 | 2d |
| ENG-PR-107 | D5 校验 + D4×D5 联动 + 论文候选保存修复 | 1d |
| ENG-PR-108 | UI 精简：主页替代列表页 + 仪表盘重构 | 1d |

---

## 9. 与 v1 的对比

| 维度 | v1 | v2 |
|------|----|----|
| 方向管理 | 自由创建/删除 | 固定 4 方向，seed 初始化 |
| 评分标准 | 模糊的 block/warn | Rubric 四字段，逐条回应 |
| AI 调用 | 无 temperature 控制 | temperature=0 |
| 维度关系 | 各自独立，互相矛盾 | 合成阶段检测并修正矛盾 |
| 知识库 | 声明了但未接入 | RAG 检索注入每个维度 |
| 论文候选 | AI 凭空生成 | D4 评分联动 + journal-metrics 校验 |
| 模型 | 单模型 | Writer(DeepSeek) + 可选 Verifier(Zhipu) |
| 主页 | 独立列表页 | DirectionsOverview 嵌入主页 |
