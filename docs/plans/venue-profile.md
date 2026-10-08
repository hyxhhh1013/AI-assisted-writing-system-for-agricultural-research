# 期刊规格登记

> 状态：**已落地**（2026-10-08）  
> 不新建页面，不建期刊库。刊名只产生建议；落库的仍是语言、模板、引用、图表预设。

## 意图

建项或修改目标期刊时，写作语言、期刊格式模板、引用体例、图表预设和这条刊名是同一套稿。以后加一本刊，只改登记表。

## 两档

| 情况 | 改哪里 |
|------|--------|
| 和族规则相同（多数英文农业刊、多数中文刊） | 不改。自由输入刊名即落到对应族 |
| 语言、模板、引用、图表或一句写作说明和族不同 | `src/lib/venues/registry.ts` 加一行 |
| 现有五套章节结构都不够 | 先在 `src/lib/template-sections.ts` 加模板并补预览，登记行再指向新模板编号 |

登记字段只允许现有枚举：`template` = `sci \| nature \| ieee \| gbt7713 \| cas`，`citationStyle` = `gbt7714 \| vancouver \| apa7 \| ieee`，`chartPreset` = `nature \| agr_journal \| print_bw`。可选 `writerNote` 进入蓝图和扩写的期刊句。别名规范化后不能重复，测试锁住。

## 匹配

`suggestVenueProfile(刊名)`：先按刊名和别名精确匹配登记，匹配不到再走族规则。空刊名不给建议。

| 顺序 | 条件 | 语言 | 模板 | 引用 | 图表 |
|------|------|------|------|------|------|
| 1 | 含汉字 | 中文 | GB/T 7713 | GB/T 7714 | `agr_journal` |
| 2 | 以 Nature 开头，且下一个字符不是字母（Natural 不命中） | 英文 | Nature | Vancouver | `nature` |
| 3 | 以 IEEE 开头，或含 IEEE Transactions | 英文 | IEEE | IEEE | `print_bw` |
| 4 | 其余含拉丁字母 | 英文 | 标准 SCI | Vancouver | `agr_journal` |

「Science of the Total Environment」走英文 SCI。中科院模板只在手选或登记行里出现。首批登记只放和族不同的刊：`中国农业科学`。

## 写入规则

- 项目保存刊名原文，以及解析后的语言、`Project.template`、引用、护照可选 `chartPreset`。不保存登记编号。
- 改登记表不回写旧项目。
- 向导、方向确认、项目设置里改刊名时，只刷新本会话还没手改过的项。
- 已有项目打开设置不自动改字段。和当前建议不一致时，显示「按该刊规格更新」，点了才写入。
- `update_paper_config` 可接收可选 `template` / `chartPreset`，工具内部不按刊名推断。

## 初稿顺序

研究型、且入口不是「已有数据」时，下一节顺序读 `getTemplateSections`。已有数据仍是方法 → 结果 → 讨论 → 引言 → 结论。综述四章不变。未选定和「从零推进」的开场文案不变；进入起草后按模板挑下一节。

## 明确不做

期刊数据库、管理页、一刊一套栏宽字体、导出书目改成 Vancouver / APA / IEEE、Agent 静默改规格。参考文献条目仍按 GB/T 7714 排。

## 验收

- 登记表加一行虚构刊名和别名后，`suggestVenueProfile` 返回该行，扩写句带上 `writerNote`。向导建议列表来自同一张表。
- 未登记的「Applied Soil Ecology」走英文 SCI 族；「土壤学报」走国标族；「Science of the Total Environment」不走 Nature。
- 手改过的字段，刊名再变也不覆盖。
- 研究型 Nature 模板、入口不是已有数据：引言写完后下一节是结果，然后才是方法。已有数据仍先方法。
- Agent 画图不传 `preset` 时用护照 `chartPreset`；传了以传入为准。
