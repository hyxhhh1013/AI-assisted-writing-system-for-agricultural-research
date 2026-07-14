# ENG-PR-200 系列：从 AI 管线到 AI Agent — 架构跃迁计划

> **状态**：规划中  
> **队列登记**：[`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 10（新增）  
> **关联**：ENG-PR-086 编辑器对话面板（本系列替代并升级其为 Agent 对话面板）  
> **创建日期**：2026-07-05

---

## 0. 背景与动机

### 0.1 当前架构本质

经过对全库代码的审查（Direction、Writing Pipeline、RAG、Literature Search 四个子系统），当前系统的本质是：

```
Human（决策者）
  → 点击按钮选择模式
    → Pipeline（硬编码编排器，if/else 分支）
      → Agent "writer" (DeepSeek)  /  Agent "verifier" (Zhipu)  /  Agent "refiner" (DeepSeek)
        → 每个 "Agent" 实际是：callAI({messages}) → parseAIJson(response)
          → 返回给 Human
```

**关键事实**：
- 代码中定义了 `AgentRole = "writer" | "verifier" | "refiner"`（`src/lib/models.ts:59`）
- 但这不是现代 AI Agent 的含义——它们只是"模型配置标签"（决定用哪个 API Key、哪个模型）
- 流程控制权 100% 在 TypeScript 代码中，AI 不做任何决策
- 零 tool-calling、零自主规划、零循环推理、零跨轮次记忆

### 0.2 为什么要改成 Agent

| 现状（Pipeline） | 目标（Agent） |
|------------------|--------------|
| 用户必须知道每一步该点什么按钮 | 用户只需说"帮我写 Introduction" |
| 写作 → 验证 → 修正需要用户手动串联 | Agent 自动串联：写完自己验证，有问题自己改 |
| 文献检索和写作是独立的操作 | Agent 判断"需要先检索再写"，自动编排 |
| 每次 AI 调用独立，不记忆上下文 | Agent 维护跨轮次记忆，不用重复说偏好 |
| 用户盯着每一步 | 用户在 Agent 工作时可以做别的，回来看结果 |

### 0.3 为什么现在做

- **基础设施全部就位**：多模型路由、RAG、外部搜索、审查查重、图表、结构化输出、跨模型验证、并发控制、用量监控——全部可用
- **ENG-PR-086 "编辑器对话面板"** 已被规划为 backlog（2-4 周），本计划替代并升级它
- **代码量可控**：Agent 层约 2,500 行新代码，仅为 Direction 模块（15,000 行）的 1/6
- **与现有系统并存**：Agent 是对现有管线的**封装**，不替换；两条路径可同时使用

---

## 1. 项目工程进度重新对齐

### 1.1 已完成（Phase 0-9，核心功能全部就绪）

| Phase | 内容 | 状态 |
|-------|------|------|
| **Phase 0** | 稳定性 P0（proxy 认证、质量闸门、路径安全、AUTH_BYPASS 防护） | 4/4 done |
| **Phase 1** | RAG 性能（JSON→二进制分离、异步加载、按需 pread） | 5/5 done |
| **Phase 2** | API 契约（Zod 校验、增量 PATCH、组件 fetch→services） | 9/9 done |
| **Phase 3** | 大文件拆分（writing route/panel、knowledge page、figure service） | 4/4 done |
| **Phase 4** | 观测运维（AiUsageLog、统一 logger） | 4/4 done |
| **Phase 5** | 质量闭环（集成测试、Playwright、Prisma 索引、any 清零） | 5/5 done |
| **Phase 6** | 协作扩写（检索预览 + 文献勾选 + bullets 逐条扩写 + 段落模式） | 096a-d done；087/080/081 done |
| **Phase 7** | 文献库增强（期刊指标、外部检索、RIS/BibTeX 导入） | 090-093 done |
| **Phase 8** | RAG 运行时性能（两阶段检索、LRU 缓存、协作式构建、warmup） | 6/6 done |
| **Phase 9** | 研究方向战略规划（Direction CRUD + Socratic + Rubric + 甘特图 + 基金申报 + 双角色） | 11/11 done |

**总计**：54/60 PR 完成（90%），核心功能全部就绪。

### 1.2 当前工作区状态

| 项 | 状态 |
|----|------|
| 当前分支 | `eng/pr-092-external-literature-search` |
| 最新提交 | `a2cfafc docs: update domain index...` |
| 工作区未提交 | 18 files, +652/-114 lines — **图表系统改进**（新增 XRD/molecule 预填、森林图 CSV 导出、PlotReplayTool 类型扩展） |
| Stash | 5 个（wip-quality-restore、wip-pr092、hold-temp-papers、hold-src-wip、wip-untracked） |
| tsc | `.next/dev/types/validator.ts` 报错（Next.js dev cache 问题，非代码问题） |

### 1.3 剩余待完成

| PR | 标题 | 估时 | 优先级 | 与 Agent 的关系 |
|----|------|------|--------|----------------|
| ENG-PR-082 | Verifier 结构化 + 选择性 Refiner | 2d | P2 | Agent 会自动调用 Verifier，此 PR 可简化 |
| ENG-PR-083 | 大纲骨架化 userSkeleton | 1d | P2 | Agent 规划阶段需要 |
| ENG-PR-084 | 入口重构：/writing 废弃 + 选区 AI | 2d | P2 | Agent 的写作入口统一 |
| ENG-PR-085 | 分析页 AI 免责标注 | 2h | P3 | 独立小 PR |
| **ENG-PR-086** | **编辑器对话面板（Phase C）** | **2-4w** | **backlog** | **→ 被本计划替代并升级** |
| ENG-PR-094 | OA 全文自动入库 | 1-2w | backlog P3 | Agent 检索能力增强 |

**关键决策**：ENG-PR-086 原本规划的"编辑器对话面板"是一个聊天 UI 嵌在编辑器旁边。本计划的 Agent 面板从架构层面重新设计了这个交互模式——不只是"聊天"，而是 Agent 自主调用工具的完整工作台。**建议不再单独做 086，其 UI 交互需求纳入 Agent 面板。**

---

## 2. Agent 架构设计

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      用户界面层                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  现有按钮式 UI (保留)  │  │  Agent 对话面板 (新增)         │    │
│  │  "检索" "扩写" "审查"  │  │  "帮我写一篇关于XX的论文"      │    │
│  └─────────┬────────────┘  └──────────────┬───────────────┘    │
│            │                              │                     │
│            ▼                              ▼                     │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ 现有 API Routes       │  │ 新 POST /api/agent (SSE)      │    │
│  │ /api/writing          │  │                              │    │
│  │ /api/review           │  │  ┌────────────────────────┐  │    │
│  │ /api/plagiarism/v2    │  │  │  Agent Loop             │  │    │
│  │ /api/chart            │  │  │  think→act→observe→     │  │    │
│  │ /api/directions/...   │  │  │  think→...→deliver     │  │    │
│  │ /api/literature/search│  │  └───────────┬────────────┘  │    │
│  └──────────────────────┘  │              │                │    │
│                             │  ┌───────────▼────────────┐  │    │
│                             │  │  Tool Registry          │  │    │
│                             │  │  search_knowledge       │  │    │
│                             │  │  write_section          │  │    │
│                             │  │  verify_content         │  │    │
│                             │  │  refine_content         │  │    │
│                             │  │  check_plagiarism       │  │    │
│                             │  │  review_content         │  │    │
│                             │  │  generate_chart         │  │    │
│                             │  │  ... (12 tools total)   │  │    │
│                             │  └───────────┬────────────┘  │    │
│                             │              │                │    │
│                             │  ┌───────────▼────────────┐  │    │
│                             │  │  Memory System          │  │    │
│                             │  │  对话缓冲 / 工作记忆     │  │    │
│                             │  │  / 参考记忆             │  │    │
│                             │  └────────────────────────┘  │    │
│                             └──────────────────────────────┘    │
│                                            │                     │
│                                            ▼                     │
│                              ┌──────────────────────────┐       │
│                              │  现有 Services / Lib      │       │
│                              │  localRAG, callAI,         │       │
│                              │  searchExternalLiterature, │       │
│                              │  plagiarism-service,       │       │
│                              │  review-service,           │       │
│                              │  generateFigure,           │       │
│                              │  direction-calibration...   │       │
│                              └──────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**核心原则**：
- Agent 层是**新增**，不替换现有管线
- 所有 Tool 的 `execute` 直接调用现有 `src/lib/` 和 `src/services/` 函数
- 现有 API routes 保持不变，继续服务于按钮式 UI
- Agent SSE endpoint 是新的入口，内部编排 Tool 调用

### 2.2 新目录结构

```
src/lib/agent/
  core/
    agent-loop.ts        # 主循环：think → act → observe → repeat
    tool-registry.ts     # 工具注册、JSON Schema 生成、执行分发
    memory.ts            # 三层记忆：对话缓冲 / 工作记忆 / 参考记忆
    planner.ts           # 目标 → 子任务拆解（一次 LLM 调用）
    safety.ts            # 确认门控、成本上限、权限分级
  tools/
    search-knowledge.ts       # localRAG.search() → Agent 可检索本地文献
    search-external.ts        # searchExternalLiterature() → Agent 可查外部数据库
    get-full-text.ts          # localRAG.getFullText() → Agent 可读全文
    write-section.ts          # runWriterPhase → Agent 可写论文章节
    verify-content.ts         # runVerifierPhase → Agent 可验证写作质量
    refine-content.ts         # runRefinerPhase → Agent 可修正问题
    check-plagiarism.ts       # plagiarism-service → Agent 可查重
    review-content.ts         # review-service → Agent 可审查论文
    generate-chart.ts         # generateFigure → Agent 可生成图表
    import-reference.ts       # 外部文献→项目参考文献
    validate-citations.ts     # validateCitations（现有 finalize 逻辑）
    analyze-direction.ts      # 方向分析（现有 analyze/route 逻辑）
  types.ts                # ToolDefinition, AgentContext, AgentEvent 等
  index.ts                # createAgent() 公共入口

src/app/api/agent/
  route.ts                # POST SSE：接收目标，流式返回 agent 过程
  schemas.ts              # Zod 请求/响应校验

src/hooks/
  use-agent.ts            # 前端：SSE 消费 + 确认交互 + 状态管理

src/components/shared/
  agent/
    agent-panel.tsx        # Agent 对话面板主组件
    agent-thought.tsx      # "思考"卡片（显示推理过程）
    agent-action.tsx       # "工具调用"卡片（显示 tool 名+参数+结果）
    agent-confirm.tsx      # "确认"弹窗（需用户批准的操作）
    agent-input.tsx        # 输入框（目标描述 + 快捷指令）
```

### 2.3 核心模块详细设计

#### 2.3.1 Tool 系统（`tool-registry.ts` + `tools/*.ts`）

**Tool 定义接口**：

```typescript
// src/lib/agent/types.ts

export interface ToolDefinition {
  /** LLM 用来选择工具的唯一标识 */
  name: string;
  /** LLM 用来理解工具用途的描述（写好这个是最关键的调优工作） */
  description: string;
  /** JSON Schema — LLM 用来生成正确的调用参数 */
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
  /** 执行业务逻辑 */
  execute: (params: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
  /** 安全等级 */
  safety: "read" | "write" | "destructive";
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean;
}

export interface AgentContext {
  userId: string;
  projectId?: string;
  directionSlug?: string;
  signal: AbortSignal;
  /** 成本控制 */
  budget: { maxIterations: number; currentIteration: number };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 供 memory.ts 做摘要 */
  summary?: string;
}
```

**12 个 Tool 与现有能力的映射**：

| # | Tool 名称 | 封装什么 | 安全等级 | 需确认 |
|---|-----------|---------|----------|--------|
| 1 | `search_knowledge` | `localRAG.search(query, opts)` | read | ❌ |
| 2 | `search_external_literature` | `searchExternalLiterature(query, opts)` | read | ❌ |
| 3 | `read_full_text` | `localRAG.getFullText(sourceId)` | read | ❌ |
| 4 | `write_section` | Writer 管线（streaming） | write | ❌ |
| 5 | `verify_content` | Verifier 管线 | read | ❌ |
| 6 | `refine_content` | Refiner 管线 | write | ❌ |
| 7 | `check_plagiarism` | `plagiarism-service` | read | ❌ |
| 8 | `review_content` | `review-service`（四维度报告） | read | ❌ |
| 9 | `generate_chart` | `generateFigure` | write | ❌ |
| 10 | `import_reference` | 外部文献 → 项目参考文献 | write | ✅ |
| 11 | `validate_citations` | `validateCitations`（现有 finalize 逻辑） | read | ❌ |
| 12 | `analyze_direction` | 方向分析（现有 analyze/route 逻辑） | read | ❌ |

**每个 Tool 代码量：~40-60 行**。`execute` 函数直接调用现有函数，不写新业务逻辑。

#### 2.3.2 Agent Loop（`agent-loop.ts`）

采用 **ReAct (Reasoning + Acting)** 模式，核心循环：

```
用户目标: "帮我写 Introduction"

第 1 轮 THINK:  我需要先了解有什么文献和数据
第 1 轮 ACT:    call search_knowledge("生物炭 土壤改良")
第 1 轮 OBSERVE: 找到 12 篇文献，3 个实验数据

第 2 轮 THINK:  文献充足。Introduction 结构：背景→现状→缺口→目标
第 2 轮 ACT:    call write_section({section: "Introduction", context: "..."})
第 2 轮 OBSERVE: 初稿已生成（流式输出 1,200 字）

第 3 轮 THINK:  初稿完成，需要验证引用准确性
第 3 轮 ACT:    call verify_content({draft: "...", sources: [...]})
第 3 轮 OBSERVE: 3 个问题：引用 [5] 断言过度、缺少对 Zhang 2023 的讨论

第 4 轮 THINK:  需要修正这 3 个问题
第 4 轮 ACT:    call refine_content({draft: "...", feedback: "..."})
第 4 轮 OBSERVE: 已修正

第 5 轮 THINK:  Introduction 完成，交付给用户
→ DELIVER
```

**核心实现伪代码**：

```typescript
// src/lib/agent/core/agent-loop.ts

export async function* runAgentLoop(
  goal: string,
  context: AgentContext,
  tools: ToolDefinition[],
): AsyncGenerator<AgentEvent> {
  const memory = createMemory(goal, tools);
  const MAX_ITERATIONS = context.budget.maxIterations;  // 默认 15

  // Step 0: 规划（首次 LLM 调用，temperature=0）
  yield { type: "agent/status", status: "planning" };
  const plan = await createPlan(goal, context);
  yield { type: "agent/plan", plan };

  // Agent 主循环
  while (memory.iteration < MAX_ITERATIONS) {
    memory.iteration++;

    // ---- THINK ----
    yield { type: "agent/status", status: "thinking" };
    const messages = memory.buildMessages();  // 系统 prompt + 工具定义 + 历史 + 当前状态
    const response = await callLLMWithTools(messages, tools);
    const choice = parseAgentResponse(response);

    if (choice.finishReason === "stop") {
      // Agent 自主判断任务完成
      memory.recordThought(choice.content);
      yield { type: "agent/thought", content: choice.content };
      yield { type: "agent/status", status: "finalizing" };
      break;
    }

    if (choice.finishReason === "tool_calls") {
      yield { type: "agent/thought", content: choice.content || null };

      // ---- ACT ----
      for (const toolCall of choice.toolCalls) {
        const tool = tools.find(t => t.name === toolCall.name);
        if (!tool) {
          memory.recordError(`未知工具: ${toolCall.name}`);
          continue;
        }

        yield { type: "agent/action", tool: toolCall.name, params: toolCall.args };

        // 安全检查
        if (shouldRequestConfirmation(tool)) {
          yield { type: "agent/confirm", tool: tool.name, params: toolCall.args };
          const approved = await waitForUserConfirmation(context.signal);
          if (!approved) {
            memory.recordSkipped(toolCall.name, "用户拒绝");
            continue;
          }
        }

        // ---- OBSERVE ----
        try {
          const result = await tool.execute(toolCall.args, context);
          memory.recordObservation(toolCall.id, result);
          yield { type: "agent/observation", tool: toolCall.name, result };
        } catch (error) {
          memory.recordObservation(toolCall.id, { success: false, error: String(error) });
          yield { type: "agent/observation", tool: toolCall.name, error: String(error) };
        }
      }
    }

    // 检查是否被用户取消
    if (context.signal.aborted) {
      yield { type: "agent/status", status: "cancelled" };
      break;
    }
  }

  // 交付
  const summary = memory.buildSummary();
  yield { type: "agent/complete", ...summary };
}
```

**关键设计决策**：

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 规划模式 | 首次 LLM 调用一次性规划，后续执行阶段不重新规划 | 简单可靠；中途需要重规划时由用户手动触发 |
| 工具调用协议 | OpenAI-compatible function calling（DeepSeek 已兼容） | 无需额外适配层 |
| 单轮多工具 | LLM 可以在同一轮调用多个工具 | 提高效率（如同时检索+分析） |
| 错误处理 | Tool 执行失败 → 错误信息喂回 LLM → LLM 决定换策略或跳过 | 不直接终止，让 Agent 自己判断 |
| 循环安全 | `maxIterations=15` + 相似调用检测（连续 3 次调同工具同参数 → 警告） | 防止烧钱死循环 |

#### 2.3.3 记忆系统（`memory.ts`）

```typescript
// src/lib/agent/core/memory.ts

interface AgentMemory {
  /** 系统层：工具定义 + 角色设定，每轮都注入 */
  system: {
    role: string;              // "你是农业科研写作助手..."
    availableTools: string;    // 工具列表的文本描述
    constraints: string;       // 安全约束、引用规则等
  };

  /** 对话缓冲：最近 N 条消息（原始），滑动窗口 */
  conversation: MessageBuffer;  // maxSize=20，满了压缩旧消息

  /** 工作记忆：当前任务的结构化状态 */
  working: {
    goal: string;                          // 用户原始目标
    plan: SubTask[];                       // 当前任务计划
    currentSubTaskIndex: number;           // 正在执行第几步
    draftedSections: Record<string, {      // 已写章节
      content: string; status: "draft" | "verified" | "refined";
    }>;
    verifiedIssues: Record<string, {       // 验证发现的问题
      section: string; issue: string; resolved: boolean;
    }[]>;
    keyFindings: {                         // 检索/分析的关键发现
      fact: string; source: string; confidence: "high" | "medium" | "low";
    }[];
    decisions: {                           // Agent 做出的决策
      what: string; why: string; when: number;
    }[];
  };

  /** 用于生成每轮 LLM 调用的 messages 数组 */
  buildMessages(): LLMMessage[];

  /** 当对话缓冲满了，压缩旧消息为摘要 */
  compressOldMessages(): Promise<void>;

  /** 构建最终交付摘要 */
  buildSummary(): AgentSummary;
}
```

**记忆压缩策略**（参考 LangChain `ConversationSummaryMemory`）：

```
对话缓冲 = 20 条消息

当第 21 条消息到来时：
  取前 10 条 → LLM 摘要 → 替换为 1 条 summary 消息
  保留后 10 条原始消息
  缓冲大小回到 11 条
```

**为什么需要这个**：Agent 每轮 think-act-observe 至少增加 3 条消息。不加压缩的话，5 轮就 15 条，10 轮就 30 条。DeepSeek context window 是 64K tokens，30 条消息加上工具定义和长文本内容很容易撑爆。

#### 2.3.4 安全护栏（`safety.ts`）

```typescript
// 绿色工具（read）：自动执行
// 黄色工具（write）：自动执行，但记录日志
// 红色工具（destructive / import）：弹窗让用户确认

const SAFETY_RULES = {
  read:    { autoExecute: true,  requireConfirm: false, logOnly: false },
  write:   { autoExecute: true,  requireConfirm: false, logOnly: true },
  destructive: { autoExecute: false, requireConfirm: true, logOnly: false },
};

// 硬性成本上限
const COST_LIMITS = {
  maxIterations: 15,          // Agent 最多循环 15 次
  maxToolCallsPerTask: 30,    // 单次任务最多调 30 次工具
  maxConsecutiveSameTool: 3,  // 连续调同一工具最多 3 次（防死循环）
};
```

#### 2.3.5 AI 层扩展（修改 `src/lib/ai.ts`）

现有 `callAI()` 需要支持 tools 参数：

```typescript
// 扩展现有 AICallOptions
export interface AICallOptions {
  // ... 现有字段不变
  tools?: ToolSchema[];       // 新增：工具定义
  tool_choice?: "auto" | "none" | "required";
}

// 扩展现有 streamAIResponse
// 现有只解析 delta.content
// 新增解析 delta.tool_calls（OpenAI-compatible streaming format）
```

**改动量**：约 50-80 行。主要是 `streamAIResponse` 里增加一个 tool_calls delta 累积器。

### 2.4 SSE 事件协议

```
POST /api/agent
Content-Type: application/json

{
  "goal": "帮我写这篇论文的 Introduction",
  "projectId": "proj_xxx",
  "directionSlug": "biochar-soil",     // 可选
  "mode": "auto" | "guided"             // auto=自主完成, guided=每步确认
}
```

**SSE 事件类型**：

```typescript
// 状态变更
{ type: "agent/status", status: "planning" | "thinking" | "executing" | "finalizing" | "completed" | "error" | "cancelled" }

// 规划结果
{ type: "agent/plan", plan: { subtasks: SubTask[] } }

// LLM 的推理过程（可折叠展示）
{ type: "agent/thought", content: string | null }

// 工具调用
{ type: "agent/action", tool: string, params: Record<string, unknown> }

// 工具结果
{ type: "agent/observation", tool: string, result?: ToolResult, error?: string }

// 流式写作内容（write_section 工具的 streaming 输出）
{ type: "agent/delta", content: string }

// 需要用户确认（仅 import_reference 等写操作工具）
{ type: "agent/confirm", tool: string, params: Record<string, unknown>, message: string }

// 完成
{ type: "agent/complete", summary: string, draftedSections: string[], issues: number, keyFindings: KeyFinding[] }
```

### 2.5 前端设计

#### 2.5.1 组件树

```
AgentPanel
├── AgentMessageList            ← 对话历史（滚动区域）
│   ├── AgentUserMessage        ← 用户输入
│   ├── AgentThoughtBubble      ← LLM 推理（可折叠，默认折叠）
│   ├── AgentActionCard         ← 工具调用（图标 + 名称 + 参数摘要）
│   │   └── 展开可看完整参数 + 结果摘要
│   ├── AgentDeltaStream        ← 流式写作内容（打字机效果）
│   └── AgentSummaryCard        ← 完成摘要
├── AgentConfirmDialog          ← 确认弹窗（覆盖在面板上）
└── AgentInputBar               ← 底部输入区
    ├── 文本输入
    ├── 快捷指令（"写Introduction" "查重" "生成图表"）
    └── [停止] 按钮
```

#### 2.5.2 交互设计

**与现有面板的关系**：
- Agent 面板作为工作台的一个新 Tab（与"写作""数据""参考文献"并列）
- 也可以作为独立的对话浮层（右下角 Fab 按钮唤起）
- **现有按钮式 UI 完全保留**，用户可以选择用 Agent 还是手动操作

**关键交互**：
- Agent 推理过程默认折叠，用户可以展开查看
- 工具调用以卡片展示，点击可展开看参数和结果
- 流式写作内容实时显示
- 需要确认时，弹窗高亮显示，其余操作被阻塞
- 用户随时可以点「停止」中断 Agent
- 用户可以在 Agent 执行过程中发新消息（"等等，换个方向"）

#### 2.5.3 前端 Hook

```typescript
// src/hooks/use-agent.ts

function useAgent(projectId?: string) {
  // SSE 消费（与 use-writing-stream 同模式）
  // 状态管理
  const {
    status,           // AgentStatus — "idle" | "planning" | "thinking" | "executing" | "waiting_confirmation" | "completed" | "error"
    messages,         // AgentMessage[] — 对话历史
    plan,             // SubTask[] | null — 当前任务计划
    pendingConfirm,   // ConfirmRequest | null — 等待用户确认的操作
    streamContent,    // string — 当前流式输出的内容
    summary,          // AgentSummary | null — 完成后的摘要
  } = agentState;

  return {
    status, messages, plan, pendingConfirm, streamContent, summary,
    sendGoal,          // (goal: string) => void — 发送新目标
    confirmAction,     // (approved: boolean) => void — 响应确认弹窗
    cancel,            // () => void — 中断 Agent
    sendMessage,       // (text: string) => void — Agent 执行中追加指令
    reset,             // () => void — 清空对话
  };
}
```

---

## 3. 分阶段实施计划

### Phase A：Agent 核心 + 只读工具（3 天）⭐ 核心里程碑

**目标**：Agent 能"看"和"想"，但不能"写"。验证整个 Agent loop 的可行性。

**文件清单**：

| 文件 | 行数 | 内容 |
|------|------|------|
| `src/lib/agent/types.ts` | ~60 | ToolDefinition, AgentContext, AgentEvent 等类型 |
| `src/lib/agent/core/tool-registry.ts` | ~80 | 工具注册、Schema 生成 |
| `src/lib/agent/core/memory.ts` | ~120 | 对话缓冲 + 摘要压缩 |
| `src/lib/agent/core/planner.ts` | ~80 | 首次 LLM 调用做任务拆解 |
| `src/lib/agent/core/safety.ts` | ~60 | 确认门控 + 成本上限 |
| `src/lib/agent/core/agent-loop.ts` | ~150 | 主循环 |
| `src/lib/agent/index.ts` | ~30 | createAgent() 公共入口 |
| `src/lib/agent/tools/search-knowledge.ts` | ~50 | localRAG.search() |
| `src/lib/agent/tools/search-external.ts` | ~50 | searchExternalLiterature() |
| `src/lib/agent/tools/get-full-text.ts` | ~40 | localRAG.getFullText() |
| `src/lib/agent/tools/verify-content.ts` | ~50 | Verifier 管线 |
| `src/lib/agent/tools/review-content.ts` | ~50 | review-service |
| `src/lib/agent/tools/validate-citations.ts` | ~50 | validateCitations |
| `src/lib/agent/tools/analyze-direction.ts` | ~60 | 方向分析 |
| `src/lib/ai.ts`（修改） | ~50 | 扩展 tools 参数 + tool_calls 解析 |
| `src/app/api/agent/route.ts` | ~120 | SSE 端点 |
| `src/app/api/agent/schemas.ts` | ~20 | Zod |
| `src/hooks/use-agent.ts` | ~180 | 前端 hook |
| `src/components/shared/agent/agent-panel.tsx` | ~250 | 对话面板 |
| `src/components/shared/agent/agent-thought.tsx` | ~50 | 思考卡片 |
| `src/components/shared/agent/agent-action.tsx` | ~80 | 工具调用卡片 |
| `src/components/shared/agent/agent-input.tsx` | ~60 | 输入区 |
| **测试** | ~300 | agent-loop + tool-registry + memory + API |

**总计**：~2,000 行

**验证标准**：
- [ ] Agent 收到"分析我这个方向有什么可写的"后，能自主调用 search_knowledge → analyze_direction → 返回分析报告
- [ ] Agent 收到"检查这篇论文的引用是否准确"后，能自主调用 validate_citations → 返回问题列表
- [ ] DeepSeek function calling 表现合格（tool 选择正确率 > 80%）
- [ ] 记忆压缩正常工作（对话超过 20 条后不丢关键信息）
- [ ] 用户可随时中断 Agent
- [ ] `npm run check` 通过

**如果 DeepSeek function calling 不可靠的备选方案**：

用 prompt-based 模拟替代 native function calling：
```typescript
// 备选：在 system prompt 中注入工具定义，要求 LLM 输出格式化的工具调用
// LLM 输出：
// ```tool_call
// {"name": "search_knowledge", "params": {"query": "生物炭 土壤改良"}}
// ```
// 代码解析 → 执行 → 结果包装为 tool_result 角色消息 → 循环
```
改动仅限于 `agent-loop.ts` 中的 `callLLMWithTools` 函数（约 50 行），不影响其他模块。

### Phase B：写入工具 + 确认门控（2 天）

**目标**：Agent 能"写"，形成一个完整的"写→验→改"闭环。

**新增文件**：

| 文件 | 行数 |
|------|------|
| `src/lib/agent/tools/write-section.ts` | ~60 |
| `src/lib/agent/tools/refine-content.ts` | ~50 |
| `src/lib/agent/tools/check-plagiarism.ts` | ~40 |
| `src/lib/agent/tools/generate-chart.ts` | ~50 |
| `src/lib/agent/tools/import-reference.ts` | ~50 |
| `src/components/shared/agent/agent-confirm.tsx` | ~60 |

**总计**：~310 行

**验证标准**：
- [ ] Agent 能完成"写 Introduction → 验证 → 修正 → 交付"的完整闭环
- [ ] import_reference 触发确认弹窗，用户可批准或拒绝
- [ ] Agent 写作内容可一键应用到编辑器（复用现有 applyToEditor）

### Phase C：自主模式 + 集成（1-2 天）

**目标**：Agent 能串联多个子任务，用户体验打磨。

**工作内容**：
- Agent 面板接入工作台 Tab（`workbench-tab-switcher.tsx` 加 `agent` tab）
- 快捷指令模板（"写 Introduction"、"检查引用"、"生成图表"、"审查全文"）
- 用户偏好记录（引用格式、语言风格、期刊目标）→ 注入 Agent system prompt
- Agent 状态落 DB（`AgentSession` 表）支持中断恢复

**Prisma migration**：

```prisma
model AgentSession {
  id          String    @id @default(cuid())
  userId      String
  projectId   String?
  directionSlug String?
  goal        String
  messages    Json      // 对话历史
  status      String    // "active" | "completed" | "cancelled"
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId, createdAt])
}
```

---

## 4. 工作量汇总

| Phase | 内容 | 新增代码 | 时间 | 风险 |
|-------|------|---------|------|------|
| **A** | Agent 核心 + 7 个只读工具 + SSE + 前端面板 | ~2,000 行 | 3 天 | DeepSeek function calling 可靠性待验证 |
| **B** | 5 个写入工具 + 确认门控 | ~310 行 | 2 天 | 低（纯体力活） |
| **C** | 自主串联 + 集成 + 偏好记忆 | ~200 行 | 1-2 天 | 低 |
| **测试** | 单元测试 + 集成测试 | ~400 行 | 包含在各 Phase | — |
| **合计** | | **~2,900 行** | **6-8 天** | |

**对比参考**：Direction 模块（Phase 9）15 commits，约 15,000 行，3 天完成。Agent 改造代码量约 Direction 的 1/5，但调试 Agent 行为的不确定性需要同样多的时间。

---

## 5. 与现有 PR 的关系

| 现有 PR | 处理方式 |
|---------|---------|
| **ENG-PR-086**（编辑器对话面板） | **取消**。本计划的 Agent 面板从架构层面重新设计，替代并升级 086 |
| ENG-PR-082（Verifier 结构化） | **简化**。Agent 模式下 Verifier 由 Agent 自动调用，不需要结构化 UI |
| ENG-PR-084（/writing 废弃 + 选区 AI） | **纳入 Phase C**。Agent 面板成为新的统一写作入口 |
| ENG-PR-083（大纲骨架化） | **保留独立**。大纲规划是 Agent 的 planner 的前置条件 |
| ENG-PR-094（OA 全文） | **保留独立**。增强 Agent 的检索能力 |

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| DeepSeek function calling 不可靠 | 中 | 高 | Phase A 第一件事就是测试；备选 prompt-based 方案只需改 50 行 |
| Agent 过度调用工具烧钱 | 中 | 中 | `maxIterations=15` + 连续同工具检测 + 成本上限 |
| Context window 被撑爆 | 中 | 中 | 记忆压缩 + 滑动窗口（LangChain 模式已验证） |
| 用户不接受 Agent 自主操作 | 低 | 低 | 保留现有按钮式 UI；Agent 可配置为 guided 模式（每步确认） |
| tsc 编译问题 | 低 | 低 | 所有新代码放独立目录，不影响现有代码 |

---

## 7. 成功标准

Phase A 完成时：
- [ ] 用户说"分析这个方向有什么可写的"→ Agent 自主检索+分析+输出报告
- [ ] 用户说"检查这段话的引用"→ Agent 自主取全文+验证+列问题
- [ ] DeepSeek function calling tool 选择正确率 > 80%
- [ ] 用户可中断 Agent 执行
- [ ] `npm run check` 通过

Phase B 完成时：
- [ ] Agent 完成"写 Introduction → 验证 → 修正"完整闭环
- [ ] Agent 写作结果可一键写入编辑器
- [ ] import_reference 等写操作触发用户确认

Phase C 完成时：
- [ ] Agent 面板作为工作台新 Tab
- [ ] 快捷指令模板可用
- [ ] 中断恢复可用
