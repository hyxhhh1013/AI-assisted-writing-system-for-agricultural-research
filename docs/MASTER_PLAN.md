# 禾书耕文（GrainScript）整体规划 v2

> **状态**：生效中（2026-07-06）  
> **取代**：分散的「部分规划」作为唯一战略主轴；具体 PR 细节仍见 `ENGINEERING_OPTIMIZATION_QUEUE.md` §11  
> **北极星**：从「功能齐全的 AI 写作工具箱」→「可走完一篇论文全生命周期的科研写作系统」

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
| **人控（默认）** | 现有工作台 Tab + 按钮 pipeline，Cockpit 引导「下一步」 |
| **自主（可选）** | Agent Tab，自然语言目标 → Tool 编排；可随时中断 |

**取消**：ENG-PR-086 独立对话面板、ENG-PR-084 单独入口重构（由 Cockpit + Agent 统一）。

---

## 2. 架构 v2

```text
表现层   Project Cockpit（阶段进度 + 任务卡 + 人控/Agent 切换）
编排层   Paper Orchestrator（LangGraph 状态机，替代自写 agent-loop）
能力层   Tools → 现有 services/lib（RAG、writing、review、chart、bridge…）
数据层   Project.paperPassport + Direction + KnowledgeFile + 文件索引
```

### 2.1 核心契约：`PaperPassport`（待建）

挂在 `Project` 上的 JSON，记录：

- `currentPhase`：0–7（对齐 academic-paper skill）
- `phaseStatus`：各阶段 locked / ready / in_progress / done
- `config`：PaperConfigRecord（Phase 0）
- `literature` / `outline` / `argument` / `draftProgress` / `citationAudit` / `abstract` / `reviewRound` / `exportFormats`
- `source`：`directionSlug` + `candidateId`（来自 Direction 桥接）

### 2.2 开源策略

| 层 | 策略 |
|----|------|
| RAG / 写作 / 审查 | **自研**（核心竞争力） |
| Agent 编排 | **LangGraph**（Wave 2 替换 `agent-loop.ts`） |
| PDF 分块 | 保留 `@langchain/textsplitters` 或原生 |
| 学术流程 | **academic-paper skill** 的 Phase 定义与 checkpoint 规则 |
| 参考 | gpt-researcher（P1）、STORM（P2–4 结构）— 只抄流程 |

---

## 3. Wave 路线图

### Wave 0 — 止血与收拢（1–2 周）✅

| ID | 工作 | 状态 |
|----|------|------|
| W0-1 | WIP 拆 3 PR：quality/chart、agent Phase A、direction bridge | done |
| W0-2 | **SEC-01** Direction `userId` + 路由 owner 作用域 | done |
| W0-3 | SEC-02/03 鉴权补齐 + JSONB 竞态 | done |
| W0-4 | 本文档 + 队列 §11 | done |
| W0-5 | 仓库卫生（tmp、migration 误删） | todo |

**完成标准**：`npm run check` 绿；Direction 仅 owner 可访问；210 桥接 merge。

### Wave 1 — Paper Passport + Cockpit（3–4 周）✅ MVP

- `contracts/paper-passport.ts` + Prisma 字段 ✅
- Phase 0 PaperConfig 持久化 ✅（工作台配置面板 + PATCH API）
- Project Cockpit UI（阶段进度 + 任务卡 + 人控/Agent）✅
- Direction→Project 写入 passport.source ✅
- ENG-PR-083 userSkeleton → Phase 2 ✅
- Direction 注册到 `module-registry` ✅
- 进度快照：`literature` / `draftProgress` / `abstractSnapshot` / `reviewRound` ✅

### Wave 2 — LangGraph + Agent 写入（3–4 周）

- LangGraph 替换 `agent-loop.ts`
- write_section / refine_content（复用 writing pipeline + 并发槽）
- AgentSession checkpoint
- ENG-PR-082 Verifier 结构化

### Wave 3 — 学术完整性（3–4 周）

- Phase 3 Argument Blueprint
- Phase 5a/5b 引用合规 + 双语摘要
- Phase 6 max-2 审查轮
- 集成测试补全

### Wave 4 — 导出与抛光（2–4 周，backlog）

- DOCX/LaTeX 导出增强
- ENG-PR-094 OA 入库
- workbench 瘦身、chart/plot 合并
- SEC-04～08

---

## 4. academic-paper Phase 对齐表

| Phase | GrainScript | Wave |
|-------|-------------|------|
| 0 CONFIG | paper-config-dialog → passport.config | 1 |
| 1 RESEARCH | RAG + 外部检索 + 210 文献注入 | 0–1 |
| 2 ARCHITECTURE | outline + blueprint | 1 |
| 3 ARGUMENTATION | **缺失** → Argument Blueprint | 3 |
| 4 DRAFTING | writing pipeline + Agent write tools | 2 |
| 5a CITATIONS | validateCitations + 扩展 | 3 |
| 5b ABSTRACT | **缺失** → 双语摘要 API | 3 |
| 6 PEER REVIEW | review-service + 2 轮编排 | 3 |
| 7 FORMAT | DOCX/PDF 部分；LaTeX 后期 | 4 |

---

## 5. 开发铁律

1. **安全 > 收拢 WIP > Passport > Agent 写入 > 新功能**
2. 新功能必须声明：**属于 Phase 几？是否写入 passport？**
3. 禁止组件内裸 `fetch`；编排只调 `services/`
4. 实现顺序：`contracts → services → hooks → components → app/api`
5. 每个 Wave 结束：更新 DOMAIN_INDEX + 演示脚本

---

## 6. 文档索引

| 文档 | 用途 |
|------|------|
| **本文件** | 唯一战略主轴 |
| `ENGINEERING_OPTIMIZATION_QUEUE.md` §11 | Wave 任务表 |
| `DOMAIN_INDEX.md` | 功能入口 |
| `SECURITY_FIX_PLAN_2026-07-05.md` | Wave 0 安全 PR |
| `plans/ENG-PR-200-agent-transformation.md` | Agent 技术细节 |
| `plans/ENG-PR-210-direction-writing-bridge.md` | 桥接细节 |
