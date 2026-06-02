# ENG-PR-070：综述 / 创新型论文双轨写作

> 状态：**进行中**  
> 分支建议：`eng/pr-070-review-dual-track`  
> 关联：`project.mode` = `review` | `research`

## Summary

将「综述模式」从「无实验数据的 IMRaD」拆为独立的**主题式文献综述**写作链路；**完整保留**「研究论文（创新型）」IMRaD + 实验数据证据链。并在**新建项目**时选定类型，项目中心 UI 区分，**工作台内不可切换**。

## 背景

- 参考：《中国茶叶》进展综述（主题分类 + 对比表 + 综合段）
- 现状：`projectMode=review` 仅去掉数据证据约束，仍用 methods/results Prompt → 产出像实验报告

## 范围

| 包含 | 不包含 |
|------|--------|
| 创建时选模式 + 列表 UI 区分 | SCI Trends 式子类型（P2） |
| Review 专用章节 / Prompt / 大纲 | RAG 索引格式变更 |
| API 创建后锁定 mode | 旧项目自动迁移 section key |
| Research 零回归 | 自动对比表生成 |

## 双轨模型

```text
review（文献综述）          research（创新型论文）
─────────────────          ─────────────────────
abstract                   abstract
introduction               introduction
background                 methods
literature_body            results (+ discussion)
conclusion                 conclusion
```

## PR 分片

### ENG-PR-070a — 创建与项目管理 UX ✅

- [x] `contracts/writing-mode.ts` — 模式元数据
- [x] `CreateProjectDialog` — 新建时二选一
- [x] `ProjectModeBadge` — 列表/首页标签
- [x] `projects/page.tsx` — 筛选 + 卡片色条/图标
- [x] `home-hero.tsx` — 接入创建对话框
- [x] `workbench-meta-dialog` — 移除模式切换，只读展示
- [x] `POST /api/projects` — 更新时不写 mode
- [x] `GET /api/projects` 列表返回 `mode`

### ENG-PR-070b — 章节注册表与默认结构 ✅

- [x] `lib/review-structure.ts` — REVIEW_SECTION_KEYS
- [x] `lib/section-registry.ts` — `getSectionsForMode()` 统一入口
- [x] `lib/store.ts` — review 默认 sections / template
- [x] `lib/template-sections.ts` — `getTemplateSections(template, mode)`
- [x] `lib/validations.ts` — section 按 mode 校验
- [x] 项目进度 API 按 mode 计核心章节

### ENG-PR-070c — Prompt 与大纲双轨 ✅

- [x] `lib/prompts/review-writing.ts` — 五章综述 Prompt
- [x] `lib/prompts/writing.ts` — `resolveSectionPrompt(section, mode)`
- [x] `lib/prompts/outline.ts` — research / review 分支
- [x] `POST /api/outline` — 接收 `projectMode`
- [x] `outline-panel` — 传 `project.mode`

### ENG-PR-070d — 写作管道与 UI 贯通 ✅

- [x] `services/writing-context.ts` — mode 感知 RAG 关键词
- [x] `prepare-context.ts` — 使用 `resolveSectionPrompt`
- [x] `workbench-page-client` — 章节侧栏随 mode
- [x] `writing-panel` — section 下拉随 mode
- [x] `lib/utils.ts` — 大纲任务映射随 mode
- [x] 预览组件 — `getTemplateSections(..., project.mode)`

### ENG-PR-070e — 预览/导出与文档 ⏳

- [ ] `server-pdf` / docx 导出按 mode（若仍硬编码 IMRAD 需补）
- [ ] `docs/domain/writing-pipeline.md` 摘要
- [ ] `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 登记

## 研究论文（创新型）零回归清单

- [ ] IMRAD 五章 key 与 Prompt 未改语义
- [ ] `data` Tab 仍 `researchOnly`
- [ ] `EvidenceClaim` + 原则2b 仍仅 research
- [ ] 创建 research 项目默认 template=sci、sections=IMRAD

## Test plan

- [ ] 新建「综述」→ 工作台无「材料与方法」章 → 大纲无试验结构
- [ ] 新建「创新型」→ 仍有 methods/results → 有 data Tab
- [ ] 项目中心筛选与 badge 正确
- [ ] 项目设置无模式切换；保存 meta 不改变 mode
- [ ] 扩写 review `literature_body` 不出现「本试验采用」
- [ ] `npx tsc --noEmit`

## 数据流

```text
新建 CreateProjectDialog(mode)
  → projectStore.create(mode, title)
  → POST /api/projects (mode 仅 create)
  → workbench(getSectionsForMode(mode))
  → outline(streamOutline({ projectMode: mode }))
  → writing({ section, projectMode: mode })
      → resolveSectionPrompt → Writer → Verifier → Refiner
```
