# 禾书耕文（GrainScript）整体规划 v2

> **状态**：生效中（2026-07-28：Wave 3.7 质量主轴挂载）  
> **取代**：分散的「部分规划」作为唯一战略主轴；任务状态以 `ENGINEERING_OPTIMIZATION_QUEUE.md` **§1 Phase 11 / 11b** 为准  
> **北极星**：从「功能齐全的 AI 写作工具箱」→「可走完一篇论文全生命周期的科研写作系统」

---

## 0. 当前真相（2026-07-24）

| 项 | 状态 | 说明 |
|----|------|------|
| Wave 0 安全/鉴权 | ✅ | W0-5 仓库卫生仍 todo |
| Wave 1 Passport + Cockpit | ✅ MVP | 契约 / sync / 任务卡 / 阶段导航已落地 |
| Wave 2 LangGraph + write tools | ✅ 产品化 MVP | GUIDE + ONESHOT + CHECKPOINT；**ENG-PR-082 done** |
| Wave 3 学术完整性 | ✅ 基本完成 | STUDENT / ABS-UI / E2E / CITE / REVIEW-2 已落地 |
| Wave 3.5 Agent≈AP 编排 | ✅ 能力桥收口 | LIT/CONFIG/CHART/MULTI-TURN done；见 orchestration 计划 |
| Wave 3.6 Agent 行为可靠 | ✅ 已收口 | [`plans/W3-AP-BEHAVIOR.md`](./plans/W3-AP-BEHAVIOR.md)：剧本 eval → 压空转 → 先读后写 |
| Wave 3.7 Agent 写作质量 | ✅ 完成 | [`plans/W3-AP-QUALITY.md`](./plans/W3-AP-QUALITY.md)：引用接地/分节完整/WQC/摘要/审查/LIVE-EVAL 全落地（2026-08-06） |
| Wave 4 导出抛光 | ⚠️ backlog | **W4-EXPORT** done；LaTeX/disclosure 等让路给 3.7 |
| 从 Demo→完整产品 | 📋 规划生效 | 见 [`PRODUCT_COMPLETION_PLAN.md`](./PRODUCT_COMPLETION_PLAN.md) |
| `/academic-paper` | ➡️ 引导页 | **不是**第二套流水线；只引导进工作台 **Agent Tab** |
| 产品主入口 | 工作台 | 人控 Tab + 自主 Agent Tab；质量中心 / 知识库为深链 |

**唯一叙事（勿再平行造入口）：**

```text
Direction → Project（PaperPassport + Cockpit）
                ↓
         工作台（人控 Tab｜Agent Tab）
                ↓
     skill Phase 0–7 = Passport 状态 + Agent 策略（不是新站点）
```

**2026-07-24 产品拍板：**

1. **自主主入口** = 工作台 **Agent Tab**（不是独立 `/agent`，不是工作坊看板）  
2. **`/academic-paper`** = **Agent 引导页**（选项目 → 打开 Agent Tab）  
3. **Wave 2 执行序**：引导页 →「写一节」闭环体验 → Session checkpoint → 再 Wave 3  

**文档铁律**：实时 status 只维护本文件 Wave 表 + 队列 Phase 11；`docs/plans/*` 是设计底稿，不维护 status。  
**防乱铁律**：新功能必须回答「挂在工作台哪条路径？是否写入 Passport？」；禁止再开第三条「可视化流水线」主轴。

---

## 1. 产品定义

**GrainScript = 实验室私域 RAG + 论文八阶段生命周期编排 + 人控/自主双模式写作。**

与通用 Chat 的差异验收（Agent 做成才算赢）：

1. 引用落在检索/项目文献池内（越界 strip）  
2. 写入当前 Project section，工作台可见  
3. 尊重 Passport 阶段铁律（配置确认、大纲批准等）  
4. 可中断后续跑（checkpoint）  
5. 学生不问「该点哪个灰按钮」

### 1.1 用户旅程（汇合于 Project）

```text
旅程 A（战略型）：Direction → 8维分析 → 路线图 → PaperConfig → 创建 Project
旅程 B（直接型）：新建 Project → 导入文献 → 选模板
旅程 C（自主型）：/academic-paper 引导 → 工作台 Agent Tab
                    ↓
         论文生命周期 Phase 0–7（Passport + Agent 策略）
```

### 1.2 交互双模式

| 模式 | 说明 |
|------|------|
| **人控（默认）** | 工作台 Tab + 按钮 pipeline，Cockpit 引导「下一步」 |
| **自主（推荐给不会写论文的学生）** | Agent Tab（`AGENT_ENABLED`）；写工具另需 `AGENT_WRITE_ENABLED` |

**已取消 / 降级：**

- ~~ENG-PR-086 独立对话面板~~ → Agent Tab  
- ~~ENG-PR-084 单独入口重构~~ → Cockpit + Agent  
- ~~`/academic-paper` 八阶段可视化工作坊当主产品~~ → **仅 Agent 引导页**（2026-07-24）

---

## 2. 架构 v2

```text
表现层   Project Cockpit + 工作台 Tab（含 Agent）+ /academic-paper 引导
编排层   LangGraph ReAct（`lib/agent/langgraph/*`；`agent-loop` 为薄入口）
能力层   Tools → services/lib（RAG、writing、review、chart、bridge…）
数据层   Project.paperPassport + Direction + KnowledgeFile + 文件索引
```

### 2.1 核心契约：`PaperPassport`（已落地 MVP）

挂在 `Project.paperPassport` 的 JSON（`src/contracts/paper-passport.ts`）：

- `currentPhase`：0–7  
- `phaseStatus`：locked / ready / in_progress / done  
- `config`：PaperConfigRecord（Phase 0）  
- 快照：`literature` / `outline` / `draftProgress` / `abstractSnapshot` / `reviewRound` 等  
- `source`：`directionSlug` + `candidateId`（Direction 桥接）  
- **待 Wave 3**：双语摘要、审查轮次编排字段补全（`argument` 快照已由 W3-ARGUMENT 接入）  

### 2.2 academic-paper skill 落点

| 层 | 落点 | 禁止 |
|----|------|------|
| 阶段定义 | Passport + Cockpit 文案 | 再建独立 Phase 看板产品 |
| 检查点铁律 | Agent 系统策略 + Cockpit 门禁 | 仅本地 localStorage 假进度 |
| 写作执行 | 人控 096 管道 + Agent write tools | 通用 Chat 无引用约束的套壳 |

### 2.3 开源策略

| 层 | 策略 |
|----|------|
| RAG / 写作 / 审查 | **自研** |
| Agent 编排 | **LangGraph** |
| 学术流程 | **academic-paper skill**（策略，非第二 UI） |
| 参考 | gpt-researcher / STORM — 只抄流程 |

---

## 3. Wave 路线图

### Wave 0 — 止血与收拢 ✅

| ID | 工作 | 状态 |
|----|------|------|
| W0-1～W0-4 | WIP 拆分、SEC-01～03、本文档 | done |
| W0-5 | 仓库卫生（tmp、migration、分支收拢） | todo |

### Wave 1 — Paper Passport + Cockpit ✅ MVP

- 契约 + Prisma 字段 + Cockpit UI + Phase 0 配置 + sync ✅  
- Direction→Project `passport.source` + ENG-PR-083 userSkeleton ✅  

### Wave 2 — LangGraph + 写作 Agent 产品化 ✅

| 项 | 状态 | 说明 |
|----|------|------|
| LangGraph + write tools | ✅ | 需 `AGENT_ENABLED` / `AGENT_WRITE_ENABLED` |
| **W2-AGENT-GUIDE** | ✅ done | `/academic-paper` → Agent 引导页；`?tab=agent` |
| **W2-AGENT-ONESHOT** | ✅ done | 写一节：提示词 + 写回刷新编辑器 + 快捷语 |
| **W2-CHECKPOINT** | ✅ done | AgentSession DB 断点 / 中断恢复 |
| ENG-PR-082 Verifier 结构化 | ✅ done | JSON issues + `review_report` SSE |
| W3-AUTO-FIX | ✅ done | Agent 写后默认自动核查修正 |

**执行序（已拍板）**：GUIDE → ONESHOT → CHECKPOINT → 再进 Wave 3。  
Wave 2 产品化三项已完成。

### Wave 3 — 学术完整性 ⚠️ **当前主轴**

| 项 | 状态 | 说明 |
|----|------|------|
| **W3-ARGUMENT** | ✅ done | Phase 3 论证蓝图：契约 / API / 提纲侧栏 / Agent tool / Passport |
| **W3-ABSTRACT** | ✅ MVP | Phase 5b 双语摘要：`POST /api/abstract/bilingual` + Agent tool |
| **W3-PHASE-PACK** | ✅ done | 阶段任务包 + 硬门禁；Agent「完成当前阶段」 |
| ENG-PR-082 / W3-AUTO-FIX | ✅ done | 结构化 Verifier + Agent 写后自动修 |
| **W3-CITE-GATE** | ✅ done | 全稿引用硬检 + PDF 导出拦截 + Passport Phase 5 |
| **W3-REVIEW-2** | ✅ done | 审查 max-2 轮编排 + Agent `run_review_rounds` |
| **W3-E2E-EVAL** | ✅ done | `npm run eval:gates` + `eval:pipeline`（EVAL_STRICT） |
| ENG-PR-085 | ✅ done | 工作台 data / 知识库精读 AI 免责 |
| W3-STUDENT / W3-ABS-UI | ✅ done | 学生模式 Agent；双语摘要进项目设置 |
| **W3-AP-AUTONOMY** | ✅ done | 自补大纲/蓝图、证据记忆、改道门禁 |
| **W3-AP-PLAN-DRIVE** | ✅ done | Plan 子任务真驱动执行环（S1） |
| **W3-AP-CHECKPOINTS** | ✅ done | 大纲/配置人在环检查点（对话确认） |
| **W3-AP-AGENTIC** | ✅ done | 对话式：inspect/read、思考-工具-对话；已取消全自动 Conductor |
| W3-AP-LIT/CONFIG/CHART/MULTI-TURN | ✅ done | 能力桥收口（2026-07-25） |
| **W3-AP-BEHAVIOR** | ✅ done | 行为主轴收口；见 [`plans/W3-AP-BEHAVIOR.md`](./plans/W3-AP-BEHAVIOR.md) |
| ~~W3-AP-CONDUCTOR~~ | cancelled | 与边聊边做冲突 |

### Wave 3.6 — Agent 行为可靠（已收口）

| 项 | 状态 | 说明 |
|----|------|------|
| **W3-AP-EVAL-SCRIPTS** | ✅ done | P1～P5 轨迹断言；`npm run eval:agent` |
| **W3-AP-ANTISPAM** | ✅ done | 检索配额 + 无进展熔断 |
| **W3-AP-READ-BEFORE-WRITE** | ✅ done | intro/discussion 写前须读上下文 |
| **W3-AP-LIT-QUALITY** | ✅ done | 相关度分 + why；低相关拒导 |
| **W3-AP-CONFIG-QA** | ✅ done | Phase0 一问一答配置 |
| **W3-AP-WORK-MEMORY** | ✅ done | 主张/决策/待办落盘 |

### Wave 3.7 — Agent 写作质量（当前主轴）

| 项 | 状态 | 说明 |
|----|------|------|
| **W3-AP-QUALITY** | 📋 todo | 主轴；详规 [`plans/W3-AP-QUALITY.md`](./plans/W3-AP-QUALITY.md) |
| W3-AP-CITE-GROUND | ✅ done | 语义可疑引用告警；`citation-grounding` |
| W3-AP-DRAFT-COVER | ✅ done | 分节完整 / 薄节；`draft-coverage` |
| W3-AP-WQC | todo | AI 腔 / overclaim 轻量质检 |
| W3-AP-WQC | todo | AI 腔 / overclaim 轻量质检 |
| W3-AP-ABS-FLOW / REVIEW-FLOW | todo | 摘要与可选审查收口 |
| W3-AP-CHART-CJK / ENTRY-WIZARD | todo | 收口已有实现 |

原则：先质量后扩模式；不做 Conductor / plan 苏格拉底 / 五人组外审 / LaTeX disclosure（本波）。

### Wave 4 — 导出与抛光（backlog）

| 项 | 状态 | 说明 |
|----|------|------|
| **W4-EXPORT** | ✅ done | DOCX/PDF 共用 `assessExportReadiness`；DOCX 对照摘要 + 图表题注清单 |
| ENG-PR-094 OA | todo | 全文入库 |
| workbench 瘦身 | todo | — |
| SEC-04～08 | todo | — |

- `academic-paper-studio/flow` 旧向导代码：仅作策略参考，不再扩展 UI  

---

## 4. academic-paper Phase 对齐表

| Phase | GrainScript | Wave | 成熟度 |
|-------|-------------|------|--------|
| 0 CONFIG | paper-config → passport.config | 1 | ✅ |
| 1 RESEARCH | RAG + 外部检索 + 210 文献注入 | 0–1 | ✅ |
| 2 ARCHITECTURE | outline + writing blueprint + userSkeleton | 1 | ✅ |
| 3 ARGUMENTATION | Argument Blueprint | 3 | ✅ MVP |
| 4 DRAFTING | writing pipeline + Agent write tools | 2 / **3.7** | ✅ 能写；**质量收口中** |
| 5a CITATIONS | validateCitations + CITE-GATE + **CITE-GROUND** | 3 / **3.7** | ✅ 编号；**语义接地 done** |
| 5b ABSTRACT | 双语摘要 API + ABS-FLOW | 3 / **3.7** | ✅ API；**Agent 收口路径 todo** |
| 6 PEER REVIEW | review-service + max-2 + REVIEW-FLOW | 3 / **3.7** | ✅ 内审；外审五人组不做 |
| 7 FORMAT | DOCX/PDF + W4-EXPORT | 4 | ✅ MVP |

---

## 5. 开发铁律

1. **安全 > 文档一致 > Wave 2 Agent 产品化 > Wave 3 学术完整性 > 新功能**  
2. 新功能必须声明：**属于 Phase 几？是否写入 passport？挂人控还是 Agent？**  
3. 禁止组件内裸 `fetch`；编排只调 `services/`  
4. 实现顺序：`contracts → services → hooks → components → app/api`  
5. 每个 Wave 结束：更新 DOMAIN_INDEX + 本文件 §0/§3  
6. **禁止**再新增与工作台平行的「完整论文流水线」站点  

---

## 6. 文档索引

| 文档 | 用途 |
|------|------|
| **本文件** | 唯一战略主轴 + §0 当前真相 |
| `PRODUCT_COMPLETION_PLAN.md` | Demo→完整产品五层与波次 |
| `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 11 / **11b** | Wave 任务表（实时 status）；**11b = 质量主轴** |
| `DOMAIN_INDEX.md` | 功能 → 代码入口 |
| `SECURITY_FIX_PLAN_2026-07-05.md` | Wave 0 安全 PR |
| `plans/*` | 设计底稿（非 status 源） |
| `academic-paper-studio/README.md` | 引导页说明（非第二产品） |
