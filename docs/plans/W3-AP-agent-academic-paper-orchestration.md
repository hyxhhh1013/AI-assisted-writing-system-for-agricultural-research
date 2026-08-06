# W3-AP：对话式科研写作智能体（对齐 academic-paper 思路）

> **状态**：规划修订生效（2026-07-24）  
> **目标**：工作台 Agent **像通用智能体一样**能思考、会调工具、自己拉上下文；整体阶段思路对齐 `/academic-paper`；**以对话推进，不做黑盒全自动流水线**。  
> **挂载**：工作台 Agent Tab + PaperPassport；禁止平行站点。

---

## 0. 产品定性（已拍板）

| 要 | 不要 |
|----|------|
| 多轮对话：用户随时插话、改方向、批准/否决 | 点一下就无人值守跑完整篇 |
| 自己 `inspect` / 检索 / 读章节拿上下文 | 只会念门禁「请去某某 Tab」 |
| 会选工具、会改道、会汇报依据 | 假 Plan 动画、空谈不落地 |
| 阶段思路跟 academic-paper（配置→文献→结构→论证→起草→引用→摘要→审查） | 再造第二套可视化流水线站点 |
| 关键节点等人确认（大纲等） | 强制一口气写完全文 |

**对标体验**：Cursor 里的通用 Agent —— 思考 → 查上下文 → 调工具 → 用中文说明 → 问你下一步。

---

## 1. 架构（薄编排 + 厚能力）

```text
用户对话
   ↓
LangGraph ReAct（思考 ↔ 工具）
   + 项目简报 / 证据摘录 / inspect&read 工具
   + academic-paper 阶段策略（提示 + 任务包，非强制状态机）
   + 可选检查点（大纲批准等）做人在环
   ↓
写回 Project + Passport 信号更新
```

**取消**：独立「全自动 Conductor 一口气跑完八阶段」作为主轴（原 S3）。  
阶段推进靠：**对话目标 + 策略提示 + 工具落地 + 人确认**。

---

## 2. 已完成

| ID | 内容 |
|----|------|
| W3-AP-AUTONOMY | 自补大纲/蓝图、证据记忆、改道门禁、加厚简报 |
| W3-AP-PLAN-DRIVE | Plan 子任务可推进（辅助，不绑架对话） |
| W3-AP-CHECKPOINTS | 配置/大纲检查点 + 面板批准 |

## 3. 进行中 / 下一步

| ID | 内容 | 状态 |
|----|------|------|
| **W3-AP-AGENTIC** | 对话式智能体：inspect/read 自取上下文；提示词改为「思考-工具-对话」；弱化强制续跑 | **done** |
| **W3-AP-SKILL-TOOLS** | 为 academic-paper 补上下文工具：read_project_asset / list_references / update_paper_config；加厚 inspect；阶段↔工具地图；预算上调 | **done** |
| **W3-AP-MEMORY** | 跨轮会话摘要注入简报 + recall_recent_work | **done** |
| **W3-AP-REVISION-COACH** | parse_revision_comments：外审意见→结构化修订路线图 | **done** |
| **W3-AP-REVISION-APPLY** | apply_revision_item：路线图条目→refine 写回；export_manuscript_markdown 轻量打包 | **done** |
| **W3-AP-CHAT-HISTORY** | 会话 `uiTranscript` 落库 + `history=1` 恢复；前端追加气泡不刷掉 | **done** |
| **W3-AP-CONTINUITY** | 新目标注入近几轮 user/assistant prior turns + 加厚记忆/提示 | **done** |
| **W3-AP-MULTI-TURN** | 同一 sessionId 跟聊（completed 后带新 goal）；面板「新对话」 | **done** |
| **W3-AP-CONFIG-UI** | Phase0 嵌 PaperConfigPanel + onProjectMutated | **done** |
| **W3-AP-LIT-BRIDGE** | 文献闭环：search_external hitJson → 确认 → 导入写回 | **done** |
| ~~W3-AP-CONDUCTOR~~ | ~~全自动八阶段~~ | **cancelled**（与对话定位冲突） |

### 3.1 下一主轴

| ID | 内容 | 状态 |
|----|------|------|
| **W3-AP-BEHAVIOR** | 暂停扩工具；剧本验收 → 压空转 → 先读后写 | **done**（2026-07-26） |
| **W3-AP-QUALITY** | 写作质量：引用接地 → 分节完整 → WQC → 摘要/审查 | **todo**（**当前主轴**） |

行为详规：[`W3-AP-BEHAVIOR.md`](./W3-AP-BEHAVIOR.md)。  
质量详规：[`W3-AP-QUALITY.md`](./W3-AP-QUALITY.md)。

---

## 4. 阶段映射（策略参考，非自动推进器）

| Phase | 含义 | Agent 典型动作 |
|-------|------|----------------|
| 0 配置 | 题目/类型/语言 | 发现缺失则问用户或检查点 |
| 1 文献 | 检索与导入 | search_* → 用证据说话 |
| 2 架构 | 大纲+写作蓝图 | generate_*，然后**对话确认** |
| 3 论证 | 主张-证据链 | build_argument_blueprint |
| 4 起草 | 分节写作 | write_section；一次聊一节也行 |
| 5 引用 | 硬检 | validate_citations |
| 6 摘要 | 双语 | write_bilingual_abstract |
| 7 审查 | ≤2 轮 | run_review_rounds |

---

## 5. 验收（对话智能体）

1. 用户说「看看项目现在卡在哪」→ Agent **自己 inspect**，用中文讲清楚缺口与建议下一步  
2. 用户说「写引言」→ 先读大纲/蓝图/文献（工具），再写，写完说明依据与字数  
3. 用户中途改口「先别写了，改大纲」→ 能停下改道，不硬跑完计划  
4. 大纲检查点是**商量**不是甩锅去人控 Tab  
5. 不要求用户理解 Passport 编号才能用
