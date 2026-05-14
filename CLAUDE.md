@AGENTS.md

## 当前工程状态 (2026-05-14)

### Prompt 系统
- 所有 AI prompt 已注入 nature-polishing 学术写作原则（Section move order、Evidence strength 分级、Results/Discussion 分离、Overclaim 防护、Limitation 要求）
- 5 个 prompt 文件：`writing.ts`、`outline.ts`、`analysis.ts`、`consistency.ts`、`domain.ts`
- Verifier 现在也检查 overclaim 和句式混淆，不只查引用
- 农业领域适配：术语适配、田间/温室试验惯例、GB/T 7713 + SCI 双轨

### 图形生成系统（统一注册表架构）
- **唯一真相源**：`scripts/charts/registry.json` — 15 种图形，4 个分类
  - 数据图表 6 种（分组柱状/堆积/百分比堆积/折线/散点/饼）
  - 示意图 2 种（流程图/机理图、分子结构图）
  - XRD 分析 6 种 + 三线表 1 种
- **加新图表**：`chart_types/` 下写 1 个 Python 文件 + registry.json 加 1 条记录，前端自动出现
- **基类**：`scripts/charts/chart_base.py` — ChartModule，自动扫描 `chart_types/` 加载
- **API**：`GET /api/figures/registry` 返回注册表，前端动态渲染
- **前端入口**：`/plot` 页面 + workbench 侧边栏倒数第二个按钮
- **三线表**：`POST /api/table` — GB/T 7714 规范，含字母上标 + ANOVA 文字生成

### Workbench 状态
- `page.tsx` 已从 1206 行拆到 839 行
- 已提取 hooks：`useDocxExport`、`useReferenceReorder`、`useProjectLoader`、`useEditorSync`、`useAutoSave`、`useMarkdownExport`、`usePdfExport`

### 基础设施
- Vitest 测试框架：6 文件 45 测试，pool=threads（Windows forks 兼容）
- feature-flags.ts：14 个功能的环境变量开关
- usage-log.ts：内存使用日志（已接入所有 AI route）
- 知识库：KnowledgeFile 支持 documentType（paper/patent/other）

### 部署
- GitHub：`https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research`
- VPS：42.194.162.51（详见 memory）
