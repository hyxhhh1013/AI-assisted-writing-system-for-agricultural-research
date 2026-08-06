# 写作 Agent 引导（/academic-paper）

> **角色变更（2026-07-24）**：本目录不再维护「八阶段可视化工作坊」产品。  
> 页面只做一件事：**选 Project → 打开工作台 Agent Tab**。  
> 战略以 [`docs/MASTER_PLAN.md`](../docs/MASTER_PLAN.md) 为准。

## 入口

- 浏览器：`/academic-paper`
- 首页模块：「写作 Agent 引导」

## 深链

| 目标 | URL |
|------|-----|
| Agent Tab | `/workbench?id=<projectId>&tab=agent` |
| 人控扩写 | `/workbench?id=<projectId>&tab=writing` |

需环境变量：`NEXT_PUBLIC_AGENT_ENABLED=1`、`AGENT_ENABLED=1`；写入另需 `AGENT_WRITE_ENABLED=1`。

## 代码

| 路径 | 用途 |
|------|------|
| `components/AgentGuidePage.tsx` | **现行**引导 UI |
| `flow/*` | skill 阶段/检查点定义，供后续 Agent 策略复用；**禁止再扩看板 UI** |
| 旧 `StudioApp` / Pipeline 等 | 遗留；勿接回路由 |

## Wave 2 后续

1. ~~引导页~~（本页）  
2. ~~`W2-AGENT-ONESHOT`：写一节闭环~~（写回刷新编辑器）  
3. `W2-CHECKPOINT`：Session 断点  

本地启用写入：

```bash
AGENT_ENABLED=1
NEXT_PUBLIC_AGENT_ENABLED=1
AGENT_WRITE_ENABLED=1
NEXT_PUBLIC_AGENT_WRITE_ENABLED=1
``` 
