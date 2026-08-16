# W3-AP-RUNTIME：把车间图纸画清楚（不换操作系统）

> **状态**：规划生效（2026-08-16）  
> **队列**：[`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 11e  
> **域文档**：[`domain/agent.md`](../domain/agent.md)  
> **前置**：Wave 3.9 已收口。同学已开始用 Agent 主入口。  
> **一句话**：循环够用；缺的是单一工具登记、可追查的会话、旧扩写管不再加功能。

---

## 0. 北极星

完善 = **加能力不用改循环，出了事能查清，新规则只改一条写作路径。**  
不是换 DeepSeek Harness，不是重写 LangGraph，不是上多 Agent。

```text
加能力     → 工具注册表加一行（一个文件）
加纪律     → AGENT_RULES 加一条
过稿硬拦   → 继续用代码（数据根基 / 引用越界）
排障       → 会话工具轨迹（短日志）
旧扩写 Tab → 冻结，不再加功能
```

---

## 1. 现在缺什么（对人话）

| 缺口 | 现象 | 不做什么 |
|------|------|----------|
| 工具清单散在 `agent-loop.ts` | 新工具要改循环入口；`tools/` 里可以有文件却没挂上（已有弃用蓝图文件） | 运行时扫磁盘（Next 打包会漏） |
| 会话只有快照 | 空转/乱搜要翻服务器日志 | 完整 event sourcing / Trajectory UI |
| 两套写作管 | Agent `write_section` 与专家工具 7 步管道并行 | 本波不删旧管（专家还在用） |
| 控制面仍散 | `nodes.ts` 仍大 | 本波不拆 1100 行（另开 PR） |

---

## 2. PR 序列（依赖只能向下）

| 序 | ID | 内容 | 估时 | 依赖 |
|----|-----|------|------|------|
| 1 | **W3-AP-ARCH-01** | 工具注册表：`tools/registry.ts` 为唯一挂载点；单测保证 `tools/*.ts` 未遗漏 | 0.5d | — |
| 2 | **W3-AP-ARCH-02** | 会话工具轨迹：快照里追加短日志（工具名 / 成败 / intentKind），上限 50 条 | 0.5d | 01 |
| 3 | **W3-AP-ARCH-03** | 冻结旧扩写管道：文档 + `writing/route.ts` 声明「新写作规则只改 Agent」 | 0.5d | — |

推荐开干顺序：**01 → 02 → 03**（03 可与 02 并行）。

---

## 3. 各 PR 任务单

### W3-AP-ARCH-01 — 工具注册表

**目标：** 加工具只改 `tools/` + 注册表，不改 `agent-loop.ts` 循环入口。

**禁止：** `fs.readdir` 运行时扫描；改 LangGraph；把弃用的 `build_argument_blueprint` 重新挂上。

**实现：**

1. `src/lib/agent/tools/registry.ts`：`READ_TOOLS` / `WRITE_TOOLS` 两张表  
2. `createReadOnlyTools` / `createAgentTools` 只读表  
3. 单测：`tools/*.ts` 去掉 `registry.ts` 与明确弃用名单后，文件名（连字符→下划线）必须出现在表里  
4. `build-argument-blueprint.ts` 留在弃用名单（执行会失败引导去 `generate_writing_blueprint`）

**验证：** `npx vitest run src/__tests__/lib/agent-tool-registry.test.ts` + 现有 `agent-safety.test.ts`（write 开关）。

### W3-AP-ARCH-02 — 会话工具轨迹

**目标：** 空转时不用翻 pm2 日志，快照里能看到最近调了哪些工具。

**禁止：** 新 Prisma 表；把 thought_delta 全文落库；做 Trajectory 大 UI。

**实现：**

1. `AgentSessionSnapshot.toolTrace?: { at: number; tool: string; ok: boolean; intentKind?: string | null }[]`  
2. `toolsNode` 每次 execute 完 append，截断 50  
3. 旧快照缺字段当 `[]`  
4. 先不进前端；需要时 `JSON` 里能读

### W3-AP-ARCH-03 — 冻结旧扩写管

**目标：** 人不再给 `/api/writing` 加新写作纪律。

**实现：** 文件头注释 + `DOMAIN_INDEX` / `writing-pipeline.md` 写明「专家工具遗留；Agent 为产品写作入口」。不删代码。

---

## 4. 明确不做

- 不迁 DeepSeek Harness / Cordis  
- 不重写 `graph.ts` 五节点  
- 不上热路径 LLM-judge / LLM 分类  
- 不往 `goal-intents.ts` 加口语门  
- 不把 Cursor skill 灌进系统 prompt  
- 不改 `backup_*`、不往 `workbench/page.tsx` 堆逻辑  

---

## 5. 验收

1. 新工具：只加 `tools/foo.ts` + 注册表一行，忘了挂单测红。  
2. write 开关关时仍无 `write_section`。  
3. 弃用蓝图工具仍不在模型可见清单里。  
4. 02 完成后：一次「写引言」快照 `toolTrace` 能看到 `write_section` 成败。  
5. 03 完成后：文档写清两条写作路径谁主谁从。
