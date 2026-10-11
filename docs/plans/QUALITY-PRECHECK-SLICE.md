# 查重预检实施切片

> 状态：已落地（2026-10-11）。`npx tsc --noEmit` 通过；`vitest` 覆盖 fingerprint、覆盖率汇总、金标文件名、AI 失败、跨项目包含率、联网失败提示。本地库已 `prisma db push`。
> 产品合同：[`QUALITY-PRECHECK.md`](./QUALITY-PRECHECK.md)（2026-09-30，代码未落地）
> 页面仍是 `/plagiarism` 质量中心。业务只改 `plagiarism-service.ts`。Agent `check_plagiarism` 走同一 service。

本切片做合同里的 **波次 A + 波次 B 的最小可用 + 降重后复检**。波次 C（段级 AI 条带、`aiSuspectRatio`）不做。

## 意图

实验室用户在提交前打开质量中心，想知道这篇稿相对**组内文献和自己的其他稿**重合在哪。现在总览上的百分比是单段最高相似度，AI 评语会写成 `0.4` 并抬成高风险。知识库比对是无序 `take 300` 的笛卡尔，长文只抽 60 段，两次结果可以对上不同文献。

成功：总览主数字是库内重合覆盖率；从知识库贴进稿的一段必须打出该文件名；AI 超时不会变成绿灯 0%。

## 判定

- 真需求。合同已写过，缺的是按现网代码切开的实施顺序。
- 类型 B：改分数口径、检索路径和 `PlagiarismCheck` 字段，不新开页面、不加 Passport 阶段。
- 确认本文件后再写代码。

## 挂接

- 路径：工作台质量中心入口卡 → `/plagiarism?id=`。总览 / 查重 / 降重三工位不动。
- Passport：不写新阶段。PDF 导出仍只看现有引用硬检。
- 人控与 Agent：只改 service，工具描述改为「库内重合预检」。
- 保存：降重写回仍走现有增量 PATCH。
- 文档：实现时同步 `docs/domain/review-plagiarism.md`、`docs/DATA_MODEL.md`。路由形状不变，不跑 `docs:api-index`，除非响应字段进了 API 索引正文。

## S1 — 口径（先做）

主数字改为 **库内重合覆盖率** `overlapCoverage`：非 `ai` 命中段落的字符并集 / 本次送检字符。`overallRisk` 只看这个数。

`matchType === "ai"` 的套话和 AI 评估留在报告里，单独标「文风提示」，不进入覆盖率，不参与去重抢文献命中。去重键改为 `(sourceOffset, matchType)`。

AI 调用失败写 `aiStatus: "failed"`，总览显示「文风未完成」。禁止把失败当成 0 分通过。套话正则里的 `[关注|重视|应用]` 改成真正的分组（字符类不会匹配「关注」）。

展示：

- 总览查重卡、报告头：覆盖率 + 风险。副文案固定「组内预检，不是知网总复制比」。
- 历史旧记录没有 `overlapCoverage` 时，显示原来的 `maxSimilarity`，并标注「旧口径」。
- 检测范围面板只保留联网开关。其余层是说明，不再做成不能点的假开关。去掉表单里重复的联网勾选。

持久化（小迁移）：

- `PlagiarismCheck.overlapCoverage Float?`
- `PlagiarismCheck.aiStatus String?`（`ok | failed | skipped`）
- 新检测把 `maxSimilarity` 写成与 `overlapCoverage` 相同，避免管理端旧列突然变成 AI 的 0.4。

风险阈值在 S2 金标锁定前用覆盖率暂定：高 ≥ 0.25，中 ≥ 0.08。S2 测试过了再改这一对数，并写进 `review-plagiarism.md`。

验收：

- [ ] 构造一条 similarity `0.4` 的 AI 命中，覆盖率仍按文本重合算，风险不为高。
- [ ] 模拟 `callAI` 抛错，结果仍返回覆盖率，`aiStatus` 为 `failed`。
- [ ] 纯短自写、无库内命中时风险为低。

## S2 — 检索后再对齐

删掉知识库 `findMany({ take: 300 })` 和「检测时给 200 条 chunk 重新嵌入」。语义笛卡尔（现网再 ×0.5）删除，不再单列一层。

字面分改成 **包含率**：本段 n-gram 有多少出现在候选文本里（`|A∩B| / |A|`）。短句对长节不再用对称 Jaccard。放在 `src/lib/text-fingerprint.ts`，先做 4-gram 包含率。Winnowing 只在金标不过时再加。

流程：

1. 全文分段，字面层不抽样。参考文献表、图题、短于 20 字的行不参与。
2. 自引：仍只和后 15 段比，改用包含率。
3. 知识库：按章调用现有 `localRAG.search`（`multiQuery: false`，每章 top-k），再对章内各段做包含率对齐。嵌入次数按章，不按句。
4. 命中块的文件名若能对上本项目参考文献，`matchedFrom` 前加「项目文献」。仍计入覆盖率（引用过的文献被大段贴上，正是预检要抓的）。
5. 跨项目：只取同一 `userId` 的其他项目章节，拆段后做内存 n-gram 倒排，再算包含率。不对整节前 800 字做 Jaccard。
6. 联网仍默认关；打开时失败要出现在进度里，不能静默变成 0 命中。

`PlagiarismMatch.sourceLength Int @default(0)`，预览能按 offset 滚到原文。

金标（不过不准标 S2 完成）：fixture 从知识库取一段贴进稿，结果必须带该文件名和可预览片段。

验收：

- [ ] 金标命中文件名。
- [ ] 一句完整出现在长章节中时，包含率高于旧 Jaccard 口径（用固定 fixture，不靠线上库）。
- [ ] 两次对同一 fixture 运行，命中的 `matchedFrom` 稳定（不再依赖无序 `take`）。

## S3 — 降重后复检

采纳并写回后，对变更章节重跑字面层（自引、知识库、跨项目）。不开联网、不跑 AI。新的一条 `PlagiarismCheck` 留下，总览并排「上次覆盖率 / 这次覆盖率」。

不把审查四维、引用硬检合成新的导出开关。导出拦截维持现状。

验收：

- [ ] 写回后不需要人手再点一次「开始查重」，才能看到新覆盖率。
- [ ] 只改了一章时，进度文案写明复检范围是该章。

## 不做

- 波次 C：段级 AI 条带、`aiSuspectRatio`、第三方 AIGC。
- 新页面、新 Tab、新 Passport 阶段。
- 六个检测层都做成开关。
- 把已引用文献自动排除出风险。
- 用更大模型给全文打一个抄袭分。
- 暗示本预检代替知网 / Turnitin。
- 把审查分加进查重分。

## 实现顺序

`text-fingerprint` 与契约 → `plagiarism-service` → Prisma 字段 → 总览 / 报告 / 检测范围 → 降重复检。组件不新增裸 `fetch`。

验证：`npx tsc --noEmit`，加上 fingerprint、覆盖率汇总、金标三条 vitest。改 schema 后更新 `docs/DATA_MODEL.md` 并 `npx prisma generate`。

## 待确认

- 覆盖率暂定阈值（高 ≥ 0.25，中 ≥ 0.08）是否接受，还是等 S2 金标跑完再定。
- S3 是否就按「变更章节整章重跑」交付。按 offset 增量重跑留到金标稳定之后。
