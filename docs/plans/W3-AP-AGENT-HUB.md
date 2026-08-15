# W3-AP-AGENT-HUB：Agent 单面工作台 + 数据闭环

> **状态**：规划生效（2026-08-15）  
> **队列**：[`ENGINEERING_OPTIMIZATION_QUEUE.md`](../ENGINEERING_OPTIMIZATION_QUEUE.md) §1 Phase 11c  
> **域文档**：[`domain/agent.md`](../domain/agent.md)、[`domain/figures-and-python.md`](../domain/figures-and-python.md)  
> **前置诊断**：数据/图/写作是四座孤岛；研究型结果章可以零数据写完（空论文）。

---

## 0. 北极星

用户**只待在工作台 Agent Tab**。上传数据、看数据根基、出图、写结果、改图，全部走对话 + 附件，不再在 data / xrd / writing / plot 之间跳。

```text
Direction → 选项目 → 工作台 Agent
                │
                ├─ 附件上传（唯一上传口）
                ├─ 对话出图 / 写节 / 改图
                └─ 右侧编辑器只读/微调正文
                     │
                     └─ /plot 仅「期刊精修」深链（不是日常入口）
```

**页面策略（分波，禁止第一刀拆光）：**

| 现状 | 目标 |
|------|------|
| 工作台 8+ Tab（structure/data/xrd/outline/writing/agent/…） | 默认：**Agent + 编辑器**；其余进「专家工具」折叠 |
| 数据必须去 `data` Tab 上传分析 | **Agent 附件区**上传 → 自动入库 |
| XRD 在 `/plot` 或 `xrd` Tab | 仪器文件走附件；Agent 工具读**已入库**峰/谱；`/plot` 只精修 |
| 写作还有独立 `writing` Tab | 主路径只 `write_section`；人控扩写降为专家抽屉 |
| `/academic-paper` | 维持引导页，只打开 Agent Tab |

不新开站点，不平行造第三条流水线（对齐 `MASTER_PLAN` 防乱铁律）。

---

## 1. 问题（为何是系统断链）

研究型论文的数据根基应是**同一份项目级对象**，被出图、写结果、质检共用。现在不是。

```text
孤岛 A  数据面板     文件 → analyzeData → dataSources + dataClaims
孤岛 B  /plot·XRD    仪器文件只在绘图页活；结果不回写项目
孤岛 C  Agent 附件   能读文本，不入库，list_plot_sources 看不见
孤岛 D  Agent 写作   write_section(results) 无数据门禁；data_ready 只是 prompt
```

| 用户实际做了什么 | Agent 实际能用 | 论文成色 |
|------------------|---------------|----------|
| 什么都没传 | 用文献写综述腔结果 | 顺，但是空的 |
| 对话里传了 CSV | 只读一段文本 | 数字/图对不齐 |
| 数据面板传过 CSV | `list_plot_sources` → 出图 → 可引用声明 | **目前唯一接近闭环** |
| 只在 /plot 做过 XRD | 看不见谱；模型可手填 `peaksJson` | 图和正文两张皮 |

后置 `validateDataClaims` 救不了：没有声明时检查列表为空，编造数字不会被拦。  
机理图「草稿 + /plot 精修」可以保留；**结果章不能是空的**。

---

## 2. 目标架构

```text
AgentInputBar 附件（唯一上传口）
  ├─ 表格 csv/xlsx/tsv     → ingest → Project.dataSources + dataClaims + chartConfigs
  ├─ 仪器 xy/xyd/ras/…     → instrument 源（峰表/谱入库后 XRD 才能用）
  ├─ 文献 pdf/docx/txt     → 现有 extract（不进 dataClaims）
  └─ 图片                  → 现有 GLM-4V extract
        │
        ▼
  assessDataFoundation()     empty | claims_only | tabular | instrument
        │
        ├─ list_plot_sources / inspect / 简报   同一套状态
        ├─ generate_chart                       只吃已入库候选或用户粘贴并立刻入库
        ├─ generate_xrd_analysis                只吃已入库峰表，禁止裸 peaksJson
        └─ write_section(results)               empty → 硬拒绝
        │
        ▼
  正文数字 ⊆ dataClaims（tolerance）
  图 URL 仍落 data/charts；权威数字在项目 JSON
```

**权威源（必须只有一份）：**

| 对象 | 存哪 | 谁写 | 谁读 |
|------|------|------|------|
| 表格分析结果 | `Project.dataSources` + `dataClaims` | `ingest_project_data`（附件/粘贴） | 出图、写结果、质检 |
| 仪器峰/晶粒 | 同上（sourceType 可标 instrument） | XRD 工具成功后回写 | `generate_xrd_analysis`、写结果 |
| 附件二进制 | `data/attachments/` + `AgentAttachment` | 上传 API | ingest / 提取文本 |
| 图文件 | `data/charts/`（URL 入库） | 出图工具 | 编辑器 / 配图坞 / `/plot` 精修 |

---

## 3. PR 序列（先功能闭环，再收页面）

依赖只能向下。**第一刀不拆 Tab。**

| 序 | ID | 内容 | 估时 | 依赖 | 状态 |
|----|-----|------|------|------|------|
| 1 | **W3-AP-DATA-01** | 数据根基判定 + 研究型 `results` 硬门禁 + inspect/简报同源 | 0.5d | — | **done** |
| 2 | **W3-AP-DATA-02** | `ingest_project_data`：附件/粘贴 CSV → 复用 `analyzeData` 写入项目 | 1d | 01 | **done** |
| 3 | **W3-AP-HUB-01** | 附件芯片识别数据文件；表格 **上传完成自动 ingest**；状态「已入库」 | 1d | 02 | **done** |
| 4 | **W3-AP-DATA-03** | 附件白名单加仪器扩展名；XRD **禁止裸 peaksJson**，只读已入库峰表 | 1d | 02 | todo |
| 5 | **W3-AP-DATA-04** | 结果章数字对账：无声明新数字拒写/标红 | 0.5d | 01, 02 | todo |
| 6 | **W3-AP-HUB-02** | 工作台默认只留 Agent + 编辑器；data/xrd/writing/outline 进「专家工具」 | 1d | 01–03 可用 | todo |
| 7 | **W3-AP-HUB-03** | `/plot` 降为配图坞「去精修」抽屉；不从主导航进 | 0.5d | FIG 精修链已有 | todo |

推荐开干顺序：**01 → 02 → 01 的门禁才有入口（02）→ HUB-01 把上传变成无感入库**。  
01 可先做（先拦住空写）；02/HUB-01 让「附件=数据口」成立。

---

## 4. 各 PR 任务单

### W3-AP-DATA-01 — 数据根基 + 结果门禁

**目标：** 研究型没有可引用数据时，禁止 `write_section(results)` 写出空结果。

**禁止：** 不改 `workbench/page.tsx`；不加新页面；不删 data Tab；不改 `backup_*`；不用 `any`。

**先做：** `rg` `write_section` / `dataClaims` / `list_plot_sources` / `checkReadBeforeWrite`。

**实现顺序：**

1. `src/lib/agent/data-foundation.ts`（纯函数）  
   - 输入：`dataSources` / `dataClaims` / plot 候选数 / 仪器源数  
   - 输出：`status: empty | claims_only | tabular | instrument` + `brief` + `blockResultsReason`  
   - `shouldBlockResultsWrite(mode, section, status)`：仅 `research` + `results` + `empty` 为 true  
   - 综述、引言、方法、讨论：**不拦**（方法可写设计；讨论可写文献）
2. `write-section.ts`：门禁失败返回明确 error（引导附件上传 / ingest，不引导去 data Tab 当主路径）
3. `inspect-project` / `formatAgentProjectBriefing` / `list_plot_sources`：同一套 `status` + 一句下一步
4. `read-before-write`：**不**把 results 并进「先读文献」门禁（那是另一件事）；数据门禁独立
5. prompt 只补一句「结果章必须先有数据根基」，硬拦才是验收

**验证：** `npx vitest run src/__tests__/lib/agent-data-foundation.test.ts` + 现有 write/briefing 套件。

**数据流：** `write_section` → `assessDataFoundation(project)` → 拒写或注入 brief → Writer。

---

### W3-AP-DATA-02 — 附件/粘贴入库 ✅ 2026-08-15

**目标：** Agent 能把表格变成与数据面板**同一份** `dataSources` + `dataClaims`。

**禁止：** 组件里 `fetch`；全量 POST Project；新分析引擎（必须复用 `analyzeFile` / `analyzeData`）。

**实现顺序：**

1. `src/lib/agent/ingest-project-data.ts`  
   - 合并规则对齐 `use-evidence`（同 `fileName` 覆盖源，按 `sourceId` 替换声明）  
   - `prisma.project.update` 只改 `dataSources` / `dataClaims` JSON
2. 工具 `ingest_project_data`  
   - `attachmentId` **或** `csvData`+`fileName`  
   - 读附件：`readAttachmentFile`（xlsx 用 buffer；csv 用文本）  
   - 空表/0 行 → 失败，不写库
3. 注册：`createAgentTools`、`PROGRESS_TOOLS`、`PROJECT_MUTATING_TOOLS`、`ui-progress`、`plan-progress`
4. `list_plot_sources` 空时的 guidance：**改成「用附件上传表格，或 ingest_project_data」**，不再主推 data Tab

**验证：** ingest 合并单测（不依赖 DB 的 merge 函数）+ 工具层 mock prisma。

**数据流：** 附件磁盘 → `analyzeFile` → PATCH 项目 JSON → `list_plot_sources` 出现候选。

---

### W3-AP-HUB-01 — 附件区就是数据口 ✅ 2026-08-15

**目标：** 用户不必喊工具名。表格拖进 Agent 输入框，提取成功后**自动 ingest**，芯片显示「已入库」。

**实现顺序：**

1. 附件元数据增加 `kind`: `tabular | instrument | document | image`（可由扩展名推断，可落 `extractSource` 旁或新列；若怕迁库，先用文件名推断不改 Prisma）
2. 上传 API 或 Agent 开跑前：对 `ready` 且 tabular 的附件调用同一套 ingest（幂等：同 fileName 覆盖）
3. `AgentInputBar` 芯片：`已入库 · 12 条声明` / `分析失败`；不要跳转 data Tab
4. 白名单仍先保持 csv/xlsx；仪器扩展名放到 DATA-03

**验证：** 组件测推断 kind；ingest 幂等单测。

**数据流：** `postAgentAttachment` → extract ready → ingest → 芯片状态；随后 `write_section(results)` 门禁可通过。

---

### W3-AP-DATA-03 — 仪器进附件，XRD 禁手填

**目标：** XRD 不再吃模型编的 `peaksJson`。

**实现顺序：**

1. `ATTACHMENT_ALLOWED_EXTENSIONS` + 前端 `client-validate` 增加 `xy/xyd/ras/raw/uxd/dif`（与 `xrd-file-ext.ts` 对齐）
2. 提取：谱文件抽成「两列文本预览」即可，**峰位仍须峰拟合/用户确认后入库**
3. `generate_xrd_analysis`：`peaksJson` 只能来自  
   - 已入库 instrument claims / 峰表源，或  
   - `sourceAttachmentId` 且该附件已 ingest 出峰表  
   裸 JSON → 拒绝：「请上传谱/峰表附件并入库，不要手填峰位」
4. Scherrer / 相检索成功后**回写** `dataClaims`（晶粒尺寸、Top1 相）

**验证：** 无来源 peaksJson 必失败；有入库峰表可跑（mock Python）。

---

### W3-AP-DATA-04 — 结果数字对账

**目标：** 有根基之后，正文不得长出声明里没有的新数字。

**实现顺序：**

1. 扩 `validateDataClaims` 或新纯函数：扫描 results 中的定量句，对不上任何 claim → issue
2. `write_section` 在 persist 前跑；失败则拒写并列出 offending 数字
3. 灰区（「约」「数量级」）不拦；精确到小数的新数要拦

**验证：** 夹具：有 D1-C1=3.4，正文写 9.9 → 拒；写 3.4 → 过。

---

### W3-AP-HUB-02 — 工作台收敛为 Agent + 编辑器

**目标：** 默认不再露出 data/xrd/writing/outline 当主 Tab。

**实现顺序：**

1. `WorkbenchTabSwitcher`：默认可见 `agent` + `structure`（编辑器需要章节树）  
   `data` / `xrd` / `outline` / `writing` 收进「专家工具」菜单
2. 环境开关 `NEXT_PUBLIC_WORKBENCH_EXPERT_TABS=1` 可恢复旧布局（实验室过渡）
3. **不删** 路由与组件；深链 `?tab=data` 仍可用
4. 新建向导文案：数据「在 Agent 对话框上传」，去掉「去数据 Tab」

**禁止：** 往 `workbench/page.tsx` 堆逻辑；只改 switcher + 文案 + hook 开关。

---

### W3-AP-HUB-03 — /plot 降为精修抽屉

**目标：** 日常不出独立「去绘图页」主路径。

**实现顺序：**

1. 主导航 / 工作台图标不再强调 `/plot`
2. 配图坞、结果卡只留「期刊精修」深链（已有 `chartAssetId` + `replaceImageUrl`）
3. 精修回写仍就地替换；数字权威不改（仍以项目 claims 为准）

机理图「Agent=结构草稿、/plot=期刊观感」**保留**，但用户不需要先打开 /plot 才能开始。

---

## 5. 验收剧本（产品，不是单测）

1. **空项目写结果**：研究型、无附件、无 dataSources → Agent 拒绝写 results，并请用户在对话框上传表格。  
2. **附件即数据**：拖入 `yield.csv` → 芯片「已入库」→ `list_plot_sources` 有候选 → `generate_chart` → `write_section(results)` 引用 `[D-…]`。  
3. **不跳 Tab**：整条路径不打开 data / xrd / writing。  
4. **XRD（DATA-03 后）**：只贴 peaksJson 失败；上传峰表/谱并入库后成功，声明出现晶粒尺寸。  
5. **专家抽屉**：`?tab=data` 仍能打开旧面板（过渡期）。

---

## 6. 明确不做（本波）

- 不新开 `/agent` 站点，不新开文件管理页  
- 不把附件默认导入知识库  
- 不承诺 Agent 一键 Nature 级机理终稿  
- 不把 PNG 塞进 Postgres 当「有数据」  
- 第一刀不删除 data Tab / `/plot` / writing 路由  
- 不在 `write_section` 里再造一套分析引擎

---

## 7. 文档与队列

| 改动 | 更新 |
|------|------|
| 本计划 | 本文 |
| 队列登记 | `ENGINEERING_OPTIMIZATION_QUEUE.md` §1 Phase 11c + §4 |
| 战略 | `MASTER_PLAN.md` Wave 3.8 |
| 域入口 | `DOMAIN_INDEX.md` 工作台 Tab 注；`domain/agent.md` 一节 |

完成某一 PR 时：代码与上述文档**同一 commit**；任务单勾选本文件对应节。
