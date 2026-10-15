# 质量中心阅读视图（QUALITY-READ）

> 状态：000–008 已落地（2026-10-12）。字面重合涂在正文上；文风提示单独列在右侧，不涂成来源。能对上原文的审查意见用下划线。
> 页面仍是 `/plagiarism`。检测与审查算法不推倒。Agent 不联动。
> 现网工位布局（已落地）：[`QUALITY-UX-workspace.md`](./QUALITY-UX-workspace.md)
> 预检口径（已落地）：[`QUALITY-PRECHECK-SLICE.md`](./QUALITY-PRECHECK-SLICE.md)、[`../domain/review-plagiarism.md`](../domain/review-plagiarism.md)

把质量中心从「总览三张卡片 + 查重 / 降重 / 审查来回跳」收成一屏：左边带颜色的全文，右边是点中这一句的来源或审查意见，百分比只在页眉。

## 意图

实验室用户提交前打开质量中心，想在稿子上看到哪里重合、点开就看来源并决定改不改。审查意见也要落在句子旁边。

成功：选中项目并完成一次查重后，不再进入单独的命中列表或降重工位。点红色句子，右侧出现来源名、对方片段、原句和「改写 / 忽略」。采用并写回后，人还在这一屏，页眉覆盖率更新。审查问题能在正文里对上原文的，用另一种标记点开；对不上的进右侧「未定位」。

## 判定

真需求。现有数据够画查重颜色，缺的是阅读布局。类型 B：改的是质量中心主路径，不新开页面，不写 Passport。

一句话：复用已有命中偏移和降重写回，把工位收成一屏。

## 现状（2026-10-11，开工前以代码为准）

### 页面

| 现网 | 位置 |
|------|------|
| 质量中心 | `src/app/plagiarism/page.tsx` → `QualityWorkspace` |
| 工位 | `overview` 三张卡片；`check` 里再分「检测配置 / 查重报告」；`rewrite`；`review` |
| 历史 | 头栏 Dialog，`UnifiedHistoryPanel` |
| 工作台 | `QualityHubCard` 跳 `/plagiarism?id=`，没有第二套查重 UI |
| 旧地址 | `/review?id=` → `/plagiarism?id=&tab=review` |
| URL | `parseQualityTab`：`check`/`result` 进查重工位，`rewrite`/`review` 进对应工位，其余进总览 |

`quality-workspace.tsx` 约 580 行，已在编排加载项目、查重、写回、复检。新交互进 `src/components/shared/quality/` 子组件，不要再把阅读逻辑堆进这个文件。

### 查重数据（够涂色）

`runPlagiarismCheck`（`plagiarism-service.ts`）是唯一业务实现。`POST /api/plagiarism/v2` 与 `POST /api/plagiarism/check` 都是薄壳，带登录和 `assertProjectOwnedByUser`。前端走 `services/plagiarism.ts` 的 `checkPlagiarismStream`。

字面命中（`self` / `cross` / `local` / `web`）写入 `sourceOffset` 和 `sourceLength`。主数字是 `overlapCoverage`。高 ≥ 0.25，中 ≥ 0.08。`matchType === "ai"` 的套话和 DeepSeek 文风评语 **不进覆盖率**，且 `sourceOffset` 常为 0、`sourceLength` 为 0，不能当成正文区间。

`splitContentByMatches`（`plagiarism-utils.ts`）用 `indexOf(sourceText)` 涂色，不用偏移。同一句出现两次时会涂到第一次。`MatchContentPreview` 只是报告里的一块预览，不能点选，也不会滚到该句。

### 降重（已有，但是另一工位）

`PlagiarismRewriteView` 调用 `rewriteMatch` / `updateRewriteSuggestion`。写回用 `applyAcceptedRewritesToSections`，按 `sourceText` 在章节里替换，再 `persistQualitySections` 增量 PATCH。

写回后 `handleAppliedRewrite` 把界面切回查重配置，并对变更章节跑 `literalOnly: true`（不开联网、不跑文风）。新的一条 `PlagiarismCheck` 留下，总览可并排上次 / 这次覆盖率。

`POST` / `PATCH /api/plagiarism/rewrite` **没有**登录用户与记录归属检查。历史和查重主路由已经有。Agent 的 `rewrite_plagiarism` 直接调 `rewrite-service`，不走这条路由。

### 审查（能到章，不能稳定到句）

`ReviewIssue` 有 `location`（自由文本）、`evidence`、`originalText?`、`suggestion`、`severity`、`dimension`。没有字符偏移。

`resolveIssueSectionKey` 能对上章节 key（标题、key、「第 N 节」、原文前 80 字），对不上返回 null。`review-issue-card` 的「写入」调用 `patchSection`，写入的是 **整章** `fixedContent`，不是把建议句嵌进原段。

审查跑在 `ReviewTab`（`tab=review`），先看到分数和问题列表。

### 明确还没有的

- 一屏阅读桌、点句选中、滚动同步、右侧来源栏。
- 审查问题的字符区间。页眉上的审查分。
- `aiSuspectRatio`、段级 AIGC 条带、自研分类器。文风只是套话正则 + 模型评语。
- 查重报告 PDF。导出拦截仍只看引用硬检。

## 目标屏

```
/plagiarism?id=
页眉：重合 12.4%（上次 18%） · 审查 72 · 组内预检，不是知网总复制比
      [检测范围/再查] [审查] [历史]
┌─────────────────────────────┬──────────────────────┐
│ 全文                         │ 点中的这一句          │
│ 重合：底色                   │ 来源、对方片段、原句   │
│ 审查：另一种标记             │ 改写 / 忽略           │
│                              │ 或审查意见 / 写入本章  │
│                              │ 涂不上的放「未定位」   │
└─────────────────────────────┴──────────────────────┘
```

无项目：页眉下只保留现在的项目选择。有项目、还没查：左边是已加载章节，右边是「开始检测」（范围说明 + 联网开关 + 进度）。不要再先落地三张卡片。

## 挂接

- 路径：工作台质量入口卡 → `/plagiarism?id=`。不新开路由。
- Passport：不写新阶段。PDF 导出仍只看引用硬检。
- 保存：章节仍走 `persistQualitySections` 增量 PATCH。
- 人控与 Agent：本队列只改质量中心。`check_plagiarism` / `review_content` / `run_review_rounds` 保持现状，不读这屏的选中句。
- 流式：继续用现有查重 SSE 进度，显示在页眉或右侧，不新事件类型。
- 文档：每项完成后更新本文件状态，并改 `docs/domain/review-plagiarism.md` 里「页面仍是工位」的那几句。路由形状不变则不跑 `docs:api-index`。

## 不做

- Agent 联动（写完自动预检、收口看板第六盏灯、审查问题走 `apply_revision_item`）。
- 新的 `plagiarism-facade`、strategy pattern、合并 `/check` 与 `/v2`。
- 跨项目改成 `requireAdmin()`。跨项目继续只比同一 `userId` 的其他稿。
- 重做知识库 / PDF 路径穿越（2026-06 已修）。
- SSE 断点续传、Prometheus。
- 自研 AIGC、`aiSuspectRatio`、把 DeepSeek 评语当成 AI 率。波次 C 仍不做。
- 用审查分改写 `overlapCoverage`。
- 预检 PDF /「送终检」打包。
- 新 Passport 阶段、新主 Tab、工作台里再嵌一套查重。

## 总表

状态：`todo` | `doing` | `done`。依赖写 ID 后缀。

| ID | 内容 | 依赖 | 估时 | 状态 |
|----|------|------|------|------|
| QUALITY-READ-000 | 降重路由补归属检查 | — | 0.5d | done |
| QUALITY-READ-001 | 按偏移涂色，涂不上的单独列出 | — | 0.5d | done |
| QUALITY-READ-002 | 阅读桌空壳：页眉 + 左全文 + 右空栏 | 001 | 1d | done |
| QUALITY-READ-003 | 点句选中、滚到该句、右侧查重来源 | 002 | 1d | done |
| QUALITY-READ-004 | 右侧完成改写 / 忽略 / 写回 / 字面复检 | 000, 003 | 1.5d | done |
| QUALITY-READ-005 | 旧工位退出主路径，旧 URL 进阅读桌 | 004 | 0.5d | done |
| QUALITY-READ-006 | 审查意见对到字符区间（对不上就未定位） | — | 0.5d | done |
| QUALITY-READ-007 | 同一篇正文上的审查标记和右侧意见 | 002, 006 | 1.5d | done |
| QUALITY-READ-008 | 页眉写清本次命中构成；文风失败不当 0 | 003 | 0.5d | done |

000 与 001、006 可并行。007 不要早于 002，避免两套主布局。

---

## QUALITY-READ-000 — 降重路由补归属

**现状。** `src/app/api/plagiarism/rewrite/route.ts` 的 POST / PATCH 只做 zod。知道 `checkId` 或 `suggestionId` 即可生成建议或改状态。`assertPlagiarismCheckOwnedByUser` 已在 `src/lib/plagiarism-access.ts`，历史路由在用。无项目的查重记录该函数返回 false。

**改动。**

- POST：登录，`assertPlagiarismCheckOwnedByUser(checkId, userId)`，否则 401 / 403。
- PATCH：建议必须属于该用户名下、且挂在其项目上的查重记录。
- 不改 `rewrite-service.ts` 的生成逻辑。不改 Agent 工具。

**验收。**

- [ ] 未登录 401。他人 `checkId` 403。
- [ ] 本人项目上的查重仍能出建议、采纳、忽略。
- [ ] 路由测试覆盖 401 / 403。现有成功路径测试继续过。

**验证。** `npx tsc --noEmit`，`npx vitest run` 相关 route 测试。

## QUALITY-READ-001 — 按偏移涂色

**现状。** `splitContentByMatches` 只搜 `sourceText`。字面命中已有偏移和长度。`ai` 且长度为 0 的不应占正文底色。

**改动。** 纯函数放在 `src/lib/plagiarism-utils.ts`（或同文件新导出），不要写进组件。

- `sourceLength > 0` 且偏移落在正文内：用切片。切片与 `sourceText` 明显不一致时退回全文搜索，并算未按偏移定位。
- 长度为 0：沿用 `sourceText` 搜索。找不到则进入 `unplaced`，不要涂在文首。
- 重叠区间按风险高的优先占住底色，另一条仍可在右侧列表出现。
- 单测补进已有 `src/__tests__/lib/plagiarism-utils.test.ts`：重复句涂在偏移处；`ai` 零长度进 `unplaced`；越界偏移不抛。

**验收。**

- [ ] 同一句出现两次时，涂的是 `sourceOffset` 那一次。
- [ ] 文风评语不把文章开头涂红。

**不改。** 覆盖率公式、`plagiarism-service` 检测层。

## QUALITY-READ-002 — 阅读桌空壳

**现状。** 默认是 `QualityOverview` 三卡片。查重结果在 `PlagiarismResultView`（筛选 + 列表 + 小预览）。

**改动。** 新建 `src/components/shared/quality/reading-desk.tsx`。`QualityWorkspace` 只负责把现有 state 传进去：章节正文、`result`、进度、`doPlagiarismCheck`。

- 有项目时主区域是阅读桌，不再默认渲染三张卡片。
- 页眉：有结果则显示 `displayedOverlap` 和风险；无结果显示「尚未检测」。副文案保留「组内预检，不是知网总复制比」。
- 左：`buildCheckContentFromSections` 的全文，用 001 的分段涂色。
- 右：未选中时写「点一句查看来源」。
- 检测中：复用 `QualityCheckProgress`，不要新进度协议。
- 无项目：保留现有项目 `<select>`。

**验收。**

- [ ] `/plagiarism?id=` 打开后直接看到正文，而不是三张卡片。
- [ ] 检测过程中页眉或右侧能看到现在的阶段文案（自引、跨项目、知识库等）。
- [ ] 组件内无裸 `fetch`。

**不改。** 降重按钮可以先不接（004）。审查工位此步可以仍从旧导航进入，007 再收。

## QUALITY-READ-003 — 点句与右侧来源

**改动。**

- 涂色 `<mark>` 可点。选中态明显。`scrollIntoView` 把该句带进左栏可视区。
- 右侧展示：`matchType` 中文、相似度、`matchedFrom`、`matchedUrl`（有则链接）、`matchedText`、原句。
- `unplaced` 列在右侧底部，点击只打开详情，不假装正文里有底色。
- 类型筛选放在右侧或页眉，数据仍是现有 `matches`。筛掉的类型不涂色。

**验收。**

- [ ] 点一处知识库命中，右侧是文件名和对方片段，左栏滚到该句。
- [ ] 点另一句，右侧换成新的一条，不跳工位。
- [ ] 只有文风评语、没有字面命中时，正文不涂，右侧「未定位」里能看见评语。

**测试。** 可用现有组件测试方式渲染阅读桌，点标记后断言来源名。纯函数已在 001 覆盖。

## QUALITY-READ-004 — 右侧改写并留在这一屏

**现状。** 采纳在降重工位。写回后 `setTab("check")` 且 `setCheckView("form")`，人被带回配置页再复检。

**改动。** 右侧对当前中、高风险字面命中提供：

- 生成建议：现有 `rewriteMatch`。
- 忽略：`updateRewriteSuggestion` status `rejected`，本屏记为已忽略。
- 采用：现有 `applyAcceptedRewritesToSections` + `handleSaveToProject`。成功后再跑现有 `literalOnly` 复检（`recheckLabel` 继续用章节名）。
- 复检进行时人留在阅读桌。页眉先保留上次覆盖率，新结果回来后并排「上次 / 这次」。失败 toast，不把建议标成已写入。

一次只处理当前选中句。不要四策略同时自动写进正文。用户点哪一条建议，就替换哪一条。

**验收。**

- [ ] 采用后正文该句替换，项目章节已 PATCH，URL 工位没有切到旧降重页。
- [ ] 复检只覆盖变更章节，进度文案带章节名。
- [ ] 写回失败时正文和「已采纳」状态不各成功一半（先 PATCH 成功再标采纳；PATCH 失败保持原句）。
- [ ] 低风险命中不出现「改写」。

**不改。** 不新增 pending 草稿表。不改覆盖率算法。

## QUALITY-READ-005 — 旧工位退出主路径

**现状。** `QualityStationNav`、总览卡片、查重配置/报告切换、降重工位仍是主路径。`tab=rewrite` 等旧链接依赖它们。

**改动。**

- 主路径只留阅读桌。检测配置收成页眉「再查」或右侧空态里的开始检测（联网开关留在这里，`DetectionScopePanel` 的说明可收成页眉详情，不要再占一整页）。
- `parseQualityTab`：`overview` / `check` / `result` / `rewrite` 都打开阅读桌。`rewrite` 若带得上最近一次结果，直接处于可改写的选中态（没有结果则空态）。`review` 仍打开阅读桌，审查层等 007；007 完成前允许暂时落在阅读桌并自动滚到右侧审查入口，不要 404。
- `tab=history` 继续打开历史 Dialog。
- 确认无引用后再删只被旧工位使用的展示组件。`rewrite-view` 若 004 已不再引用，删掉或改成右侧子块，不要两套改写 UI。

**验收。**

- [ ] `/plagiarism?id=&tab=rewrite` 和 `tab=result` 打开的是阅读桌。
- [ ] `/review?id=` 仍进质量中心。
- [ ] 工作台入口卡链接不用改路径。

**文档。** `docs/domain/review-plagiarism.md` 入口表改成阅读桌。`QUALITY-UX-workspace.md` 顶部注明工位布局已被本队列取代。`DOMAIN_INDEX.md` 质量中心一行改成阅读桌。

## QUALITY-READ-006 — 审查意见定位

**现状。** 只能解析到章节，不能给 `<mark>` 用。

**改动。** `src/lib/quality-sections.ts` 增加纯函数，输入拼接后的全文（与阅读桌左边同一字符串）、章节列表、一条 `ReviewIssue`。

返回：

- 对上 `originalText`（至少 6 字，取正文中第一次出现）：`sectionKey` + `offset` + `length`。
- 只有章节、没有可找到的原文：`sectionKey`，`placed: false`。
- 都没有：`null`。

不要为了定位再调模型。单测加在 `quality-sections.test.ts`。

**验收。** 2026-10-12 已落地：`locateReviewIssue` / `anchorReviewReport`。

- [x] 原文片段在第二章时，偏移落在第二章，而不是全文第一次碰巧相似的短词。
- [x] 空 `originalText` 且 location 写「引言」：能到章，`placed` 为 false。
- [x] 完全对不上：`null`，函数不抛。

## QUALITY-READ-007 — 审查标记落在同一篇正文

**现状。** `ReviewTab` 是另一工位。写入是整章替换。

**改动。**

- 页眉一个审查入口，跑现有审查请求（读 `review-tab.tsx` 现在怎么提交，复用 `services/review`，不新路由）。
- 跑完后分数和等级缩成页眉芯片。问题用 006 的结果画第二种标记（下划线或侧边条，与重合底色可同时存在）。
- 点审查标记：右侧换成意见（维度、严重度、描述、建议）。与查重点击互斥，右侧同时只详述一种。
- 「未定位」分组列出 `placed === false` 和 `null`。
- 生成修复、忽略、写入：复用 `review-issue-card` 已有回调。写入按钮写「写入本章」，因为 `patchSection` 替换的是整章 `fixedContent`。不要把 `fixedContent` 当成句内替换。

**验收。** 2026-10-12 已落地：正文下划线，右侧 `ReviewIssueCard`（按钮「写入本章」），审查分只做页眉芯片。`ReviewTab` 仍挂载以复用现有审查请求，不在主栏展开。

- [x] 有 `originalText` 且能对上的问题，点正文标记即可在右侧读到，不用先打开总分页。
- [x] 对不上的问题出现在「审查未定位」，不涂在文首。
- [x] 写入本章仍走原来的整章 `patchSection`，不把 `fixedContent` 当成句内替换。
- [x] 重合底色还在。审查分不写入 `overlapCoverage`。

**不改。** 四维 prompt、最多两轮、`run_review_rounds`。

## QUALITY-READ-008 — 页眉说明这次查了什么

**现状。** 结果里已有 `stats`（自引、跨项目、知识库、联网、文风条数）和 `aiStatus`、`warnings`。总览用小字，阅读桌还没有。

**改动。** 页眉副文案用本次统计，例如「文内 2 · 文献库 5 · 跨项目 1」。联网失败时展示已有 `warnings`，不要显示成 0 命中通过。`aiStatus === "failed"` 时页眉写「文风未完成」。旧记录没有 `overlapCoverage` 时继续标「旧口径」。

**验收。**

- [ ] 不新增埋点系统。数字来自现有 `CheckResult.stats`。
- [ ] 文风失败时百分比仍是库内重合，旁边能看见「文风未完成」。

## 整队列走查

1. 从工作台进质量中心，看到全文和页眉，没有三张卡片。
2. 开始检测，进度仍按阶段出现。结束后点一处红色，右侧是来源。
3. 采用一条改写，章节写回，复检后页眉出现上次 / 这次，人还在这一屏。
4. 跑审查，能对上的意见在句子上，对不上的在未定位。写入本章的行为与旧审查卡一致。
5. 旧 URL `tab=result|rewrite|review` 和 `/review?id=` 都能进阅读桌。

验证：`npx tsc --noEmit` 与相关 vitest。002 之后的 UI 项在浏览器里走上述主路径（桌面宽度）。移动端至少保证左文右栏改为上下堆叠，不要求另做一套交互。

## 延后（本文件不排期）

自研 AIGC 要有本组「助手初稿 / 人改后」对照，再单独立项。在那之前不要加 AI 率。预检说明导出同样单独立项。
