# 禾书耕文（GrainScript）整体规划 v2

> **状态**：生效中（2026-07-14 收拢修订）  
> **取代**：分散的「部分规划」作为唯一战略主轴；任务状态以 `ENGINEERING_OPTIMIZATION_QUEUE.md` **§1 Phase 11** 为准  
> **北极星**：从「功能齐全的 AI 写作工具箱」→「可走完一篇论文全生命周期的科研写作系统」

---

## 0. 当前真相（2026-07-14）

| 项 | 状态 | 说明 |
|----|------|------|
| Wave 0 安全/鉴权 | ✅ | W0-5 仓库卫生仍 todo |
| Wave 1 Passport + Cockpit | ✅ MVP | 契约 / sync / 任务卡 / 阶段导航已落地 |
| Wave 2 LangGraph + write tools | ⚠️ 部分 | 图与 write tools 已接；**无** AgentSession checkpoint；ENG-PR-082 未做 |
| Wave 3 学术完整性 | ❌ 未开 | Argument Blueprint / 双语摘要 / 审查多轮 |
| 产品主入口 | 工作台 | `/writing`、`/analysis`、`/outline`、`/review`、`/directions` 均为重定向或并入 |

**唯一叙事**：`Direction → Project（PaperPassport + Cockpit）→ 工作台 Tab`；质量中心 `/plagiarism`、知识库 `/knowledge` 为独立深链。

**文档铁律**：实时 status 只维护本文件 Wave 表 + 队列 Phase 11；`docs/plans/*` 是设计底稿，不维护 status。

---

## 1. 产品定义

**GrainScript = 实验室私域 RAG + 论文八阶段生命周期编排 + 人控/自主双模式写作。**

### 1.1 用户旅程（汇合于 Project）

```text
旅程 A（战略型）：Direction → 8维分析 → 路线图 → PaperConfig → 创建 Project
旅程 B（直接型）：新建 Project → 导入文献 → 选模板
                    ↓
         论文生命周期 Phase 0–7（统一主轴）
```

### 1.2 交互双模式

| 模式 | 说明 |
|------|------|
| **人控（默认）** | 工作台 Tab + 按钮 pipeline，Cockpit 引导「下一步」 |
| **自主（可选）** | Agent Tab（`AGENT_ENABLED`）；写工具另需 `AGENT_WRITE_ENABLED` |

**已取消**：ENG-PR-086 独立对话面板、ENG-PR-084 单独入口重构（由 Cockpit + Agent 统一）。

---

## 2. 架构 v2

```text
表现层   Project Cockpit（阶段进度 + 任务卡 + 人控/Agent 切换）
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
- **待 Wave 3**：`argument`、双语摘要、审查轮次编排字段补全

### 2.2 开源策略

| 层 | 策略 |
|----|------|
| RAG / 写作 / 审查 | **自研** |
| Agent 编排 | **LangGraph**（已替换自写循环主体） |
| 学术流程 | **academic-paper skill** Phase 定义 |
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

### Wave 2 — LangGraph + Agent 写入 ⚠️ 部分完成

| 项 | 状态 |
|----|------|
| LangGraph 四节点 + `runAgentLoop` 委托 | ✅（代码在工作区 / 待合入 main） |
| `write_section` / `refine_content` 等写工具 | ✅（需 `AGENT_WRITE_ENABLED=1`） |
| AgentSession DB checkpoint | ❌ |
| ENG-PR-082 Verifier 结构化 | ❌ todo |

### Wave 3 — 学术完整性（下一主轴）

- Phase 3 Argument Blueprint
- Phase 5a/5b 引用合规 + 双语摘要 API
- Phase 6 max-2 审查轮编排
- ENG-PR-085 分析页免责（若独立 analysis 已重定向，改为工作台 data 面板标注）
- 集成测试补全

### Wave 4 — 导出与抛光（backlog）

- DOCX/LaTeX、ENG-PR-094 OA、workbench 瘦身、SEC-04～08

---

## 4. academic-paper Phase 对齐表

| Phase | GrainScript | Wave | 成熟度 |
|-------|-------------|------|--------|
| 0 CONFIG | paper-config → passport.config | 1 | ✅ |
| 1 RESEARCH | RAG + 外部检索 + 210 文献注入 | 0–1 | ✅ |
| 2 ARCHITECTURE | outline + writing blueprint + userSkeleton | 1 | ✅ |
| 3 ARGUMENTATION | Argument Blueprint | 3 | ❌ |
| 4 DRAFTING | writing pipeline + Agent write tools | 2 | ⚠️ |
| 5a CITATIONS | validateCitations + 扩展 | 3 | 部分 |
| 5b ABSTRACT | 双语摘要 API | 3 | ❌ |
| 6 PEER REVIEW | review-service + 2 轮编排 | 3 | 单次有、编排无 |
| 7 FORMAT | DOCX/PDF；LaTeX 后期 | 4 | 部分 |

---

## 5. 开发铁律

1. **安全 > 收拢 WIP > 文档一致 > Wave 3 学术完整性 > 新功能**
2. 新功能必须声明：**属于 Phase 几？是否写入 passport？**
3. 禁止组件内裸 `fetch`；编排只调 `services/`
4. 实现顺序：`contracts → services → hooks → components → app/api`
5. 每个 Wave 结束：更新 DOMAIN_INDEX + 本文件 §0/§3

---

## 6. 文档索引

| 文档 | 用途 |
|------|------|
| **本文件** | 唯一战略主轴 + §0 当前真相 |
| `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 11 | Wave 任务表（实时 status） |
| `DOMAIN_INDEX.md` | 功能 → 代码入口 |
| `SECURITY_FIX_PLAN_2026-07-05.md` | Wave 0 安全 PR |
| `plans/*` | 设计底稿（非 status 源） |
