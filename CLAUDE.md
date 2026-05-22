@AGENTS.md

## Vibecoding 规范

每次做功能按这个模板：

```
目标：只实现 xxx 功能。

禁止：
- 不要改 workbench/page.tsx，除非只是接入现有 hook
- 不要直接 fetch()——用 services/ 封装
- 不要全量保存 Project——用增量 PATCH
- 不要使用 any
- 不要改 backup_*

先做：rg 搜索相关引用，列出影响范围。

实现顺序：
1. src/contracts/     — 新增/修改类型
2. src/services/      — 新增/修改 service 或 API
3. src/hooks/         — 新增/修改 hook
4. src/components/    — 新增/修改组件

验证：
  npx tsc --noEmit && npm run test

交付：说明数据流 UI → service → API → DB/AI → UI
```

## 当前工程状态 (2026-05-16)

### 架构 v2 重构完成（2026-05-15 ~ 2026-05-16）

**契约层**：`src/contracts/` — SSE/Writing/Project/Figure 类型，前后端共享
**保存模型**：增量 upsert，不再 deleteMany 全量覆盖
**SSE 统一**：/api/writing 全部 20+ 排放点改为 `{type, ...}` 格式，前端用类型守卫解析
**Python 路径**：8 路由从硬编码改为 `process.env.PYTHON_CMD`
**middleware → proxy**：Next 16 迁移完成，零警告
**质量闸门**：`npm run check`、`.gitignore`、`empty.js`

**新增文件**（本轮 12 个）：
```
src/contracts/{sse,writing,project,figure,index}.ts
src/hooks/{use-writing-stream,use-figure-pipeline}.ts
src/services/{writing-context,xrd-runner}.ts
src/lib/{imrad,citation,math-delimiter,markdown-parser,content-pipeline,sse-client}.ts
empty.js
```

**关键行数变化**：
| 文件 | 重构前 | 重构后 |
|------|--------|--------|
| /api/writing/route.ts | 495 | 312 |
| writing-panel.tsx | 865 | 761 |
| workbench/page.tsx | 846 | 784 |

**TypeScript**：0 errors | **Dev server**：零警告启动

### 明天待续

1. **lint 修复**：159 errors，大部分是旧代码历史债务
2. **useFigurePipeline 接入 WritingPanel**：hook 已写，旧 FIGURE 代码还在 WritingPanel 里
3. **测试已有功能**：扩写流程（Writer→Verifier→Refiner→引用修正）、PDF/Word 导出、公式渲染
4. **打包部署**：重新 build + 更新部署包

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
