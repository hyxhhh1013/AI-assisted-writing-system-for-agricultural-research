# 禾书耕文 — 从 Demo 到完整产品规划

> 状态：生效中（2026-07-24）  
> 配套：`MASTER_PLAN.md` §0 / §3；任务 status 以 `ENGINEERING_OPTIMIZATION_QUEUE.md` Phase 11 为准  
> 北极星验收：**不会写论文的学生，不问技术细节，也能从空项目走到可交稿**

---

## 0. 判断（已拍板）

| 现状 | 完整产品 |
|------|----------|
| 侧栏 Chat + 工具箱 | Passport **阶段任务包**驱动的执行器 |
| 单节写通 | 全篇质量闸门 + 可恢复编排 |
| 人控 / Agent 两套话术 | Cockpit「下一步」唯一叙事；Agent 只执行 |
| MVP API 点状落地 | 阶段闭环可测、可回归 |

**不上**完整 LangChain 全家桶；**不重开**第三套流水线站点。保留 LangGraph ReAct + 自有 writing/RAG。

---

## 1. 完整产品五层

```text
L1 生命周期引擎   Passport 硬编排 + 阶段任务包 + 工具门禁
L2 质量闭环       Verifier 结构化 → 自动 refine；引用闸；审查 max-2
L3 一体体验       Cockpit / Agent / 编辑器同一进度；学生模式按钮优先
L4 可靠性         端到端 eval 进门禁；预算/断点/降级可见
L5 交稿面         DOCX/模板/双语进导出；数据免责；部署打磨
```

---

## 2. 执行波次（产品化补完）

### Wave P1 — 执行器化（当前立刻做）

| ID | 交付 | 验收 |
|----|------|------|
| **W3-PHASE-PACK** | 按 Passport 当前阶段生成「任务包」：目标文案、推荐工具、硬门禁、Agent 默认计划 | 无大纲无法写正文；Agent 空目标时跑「完成当前阶段」 |
| W3-PHASE-UI | Agent / Cockpit「完成当前阶段」主按钮；自由聊天降级为次要 | 学生不打字也能推进一阶段 |

### Wave P2 — 质量可过稿

| ID | 交付 | 验收 |
|----|------|------|
| ENG-PR-082 | Verifier JSON 结构化 | 可映射到 refine 意见 | ✅ |
| W3-AUTO-FIX | 写后自动 audit→fix 一轮（可关） | 明显 overclaim / 越界引用被改掉或标红 | ✅ |
| W3-CITE-GATE | 扩写/导出前引用一致性硬检 | 越界编号无法标「可过稿」 | ✅ |
| W3-REVIEW-2 | 审查 max-2 轮编排 + Passport reviewRound | 两轮后才能进导出就绪 | ✅ |

### Wave P3 — 学生可独立跑通

| ID | 交付 | 验收 |
|----|------|------|
| W3-STUDENT | 学生模式：阶段按钮、少聊天、失败一句话+按钮 | 实验室新人 30min 内完成「文献→大纲→写一节」 | ✅ |
| W3-E2E-EVAL | `eval-pipeline-paper` + Agent 任务包进 CI/本地门禁 | 固定样例回归绿 | ✅ |
| W3-ABS-UI | 双语摘要进人控工作台（非仅 Agent） | 摘要 Tab/章节可见中英 | ✅ |

### Wave P4 — 交稿（原 Wave 4）

| ID | 交付 | 验收 |
|----|------|------|
| **W4-EXPORT** | DOCX/PDF 共用导出就绪硬检；DOCX 双语对照摘要 + 图表题注清单 | 越界引用无法导出；有 Passport 对照摘要则写入 Word | ✅ |
| ENG-PR-094 | OA 全文入库 | backlog |
| workbench 瘦身 | 编排下沉 hooks | backlog |

---

## 3. 阶段任务包（与运行时 Passport 对齐）

> 以 `paper-passport-progress.ts` / `getNextPhaseHint` 为准（0–7）。

| Phase | 任务包目标 | 主工具 | 硬门禁 |
|-------|------------|--------|--------|
| 0 | 确认题目/类型/语言 | （人控配置） | 无 config 不进检索写作 |
| 1 | 检索并沉淀文献要点 | `search_knowledge` / `import_reference` | — |
| 2 | 大纲+写作蓝图就绪 | （人控提纲；Agent 只给要点） | 无大纲禁止 write_section |
| 3 | 论证蓝图 | `build_argument_blueprint` | 无大纲禁止 |
| 4 | 补空白核心章节 | `write_section` | 无大纲禁止；优先空白节 |
| 5 | 引用编号合规 | `validate_citations` | — |
| 6 | 双语摘要 | `write_bilingual_abstract` | 无正文禁止 |
| 7 | 审查（→后续 2 轮） | `review_content` / `check_plagiarism` | — |

「一键写完整篇」= **串行执行各阶段任务包**（每阶段需用户确认或学生模式自动确认），不是单次超长 prompt。

---

## 4. 本周开工顺序

1. ~~**W3-PHASE-PACK**（本会话）~~ ✅  
2. ~~W3-PHASE-UI（Agent 主按钮）~~ ✅（Cockpit 联动可后补）  
3. ~~ENG-PR-082 → W3-AUTO-FIX~~ ✅  
4. ~~W3-REVIEW-2~~ ✅  
5. ~~W3-CITE-GATE~~ ✅  
6. ~~W3-E2E-EVAL~~ ✅（`npm run eval:gates`；可选 `EVAL_STRICT=1 npm run eval:pipeline`）  
7. ~~ENG-PR-085~~ ✅  
8. ~~W3-ABS-UI~~ ✅（项目设置 → 双语摘要控件）  
9. ~~W3-STUDENT~~ ✅（Agent 默认学生模式：阶段主按钮 + 失败再试）  
10. ~~W4-EXPORT~~ ✅（DOCX 硬检 + 双语摘要 + 题注清单）  

每完成一项：更新本文件勾选意图 + 队列 §1 + `MASTER_PLAN` §0。

---

## 5. 非目标

- 独立 `/agent` 站点或可视化八阶段看板当主产品  
- 用 LangChain Chains/Memory 重写写作管道  
- 在 `workbench/page.tsx` / `writing-panel` 堆业务  
