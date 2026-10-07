# RAG-PROP — 中间档检索（命题 + 篇卡 + 引用邻域）

> **状态**：计划，未开工。2026-10-07 修订：效果拉满；写作路径在晋级前不动；替换在深夜、一次一个分类。  
> **日期**：2026-10-07。  
> **对齐**：线上宿主机 PostgreSQL（整库约 24 MB）+ `papers/` 约 8.6 GB（约 2600 篇）+ `data/index_*.json` 约 17.8 万块。向量文件几乎只有热化学一小份 `.emb`。  
> **不做**：全库识图、自建 BGE-M3、把索引迁进 Postgres、`KnowledgeChunk` 回填、改写作图拓扑。写作进程里不跑 GROBID / MinerU。  
> **冲突时**：本节（§0）盖过下文。下文里「recall 持平可过」「整页两簇」「分号切句」「短于 15 字丢掉」「无摘要就拼代理摘要」「重切直接覆盖线上索引」「低峰可以连着跑完全库」不再有效。

本计划先把入库句子洗成可读的整句，再决定写作要不要改吃「一句 + 父段落」。目标是证据句和论文原句一致，且现行写作在晋级前读到的仍是现在的索引。

---

## 0. 修订：最好效果，且不碰写作

写作正式链路（`searchWritingRagChunks`、`shouldSkipKnowledgeRag`、Writer 拼上下文、写完后的引用接地、导出硬门）在晋级命令执行前不改行为。新切块只写 `data/shadow/`。线上 `index_*.json`、`.emb`、Stage 1 缓存保持原样，失败可以整类丢掉影子，不用回滚线上。

### 0.1 两段晋级

| 段 | 写作看到什么 | 什么算能晋级 |
|----|----------------|--------------|
| 第一段：洗净正文 | 契约不变，仍是约 1000/200 的窗口。变的只是窗口里的字来自正确阅读顺序 | 金句逐句对上；该分类跨栏句为 0；失败页没有用新错句覆盖旧文本 |
| 第二段：命题检索 | 才改成「命中句 + 父段落」、篇卡、表、邻域、相反标记 | 同一批主张上，影子证据含金句的比例不低于现行索引；抽一节做引用接地，不比现行差。不过就继续吃第一段的干净窗口 |

第一段是清洗。第二段是检索形态。第二段没过，不改写作怎么拼上下文。

### 0.2 抽取要够好

仍从 pdf.js 字形坐标出发，不先换解析器。

- 阅读顺序按横带再分栏。通栏标题、图、表各自成带；只有带内 x 有稳定空隙才分栏，栏数按空隙数，不写死两栏。一句的字形若横跨栏间空隙，这句标失败，不进影子正文。
- 表用坐标认单元格（同一行的 x 簇）。禁止对 `join(" ")` 之后的字符串认表。认不稳的表不入库，也不把表内数字留在破句里。
- 分句用 `Intl.Segmenter`。只在句末标点断句，不断中文分号、英文分号。不再因为短于 15 字就丢。
- 页眉页脚只删页面最上、最下一带里、去掉数字后仍跨页重复的行。正文中间的同句保留。
- 无书目摘要时不拼代理摘要。篇卡在摘要被金句抽查证明就是摘要之前，只用题名。

### 0.3 失败页怎么补，才叫最好

金句对不上、或跨栏检查失败的页，不把启发式结果晋级。这一页在影子里保留现行索引的旧文本。

补救只在写作进程之外做：低峰、单进程、一次一页或一篇，用版面解析器（MinerU 或 GROBID）抽出该页正文，再跑同一套金句和跨栏检查。8 GB 写作机上禁止和 `pm2` 同时跑。没有解析器、或补完仍失败：该页留旧文本，附录记下文件名和页码。不允许用未通过的新句替换旧句。

### 0.4 向量和邻域

和影子比「变好了没有」时，该分类若原来有 `.emb`，先在影子上重嵌再比。没有嵌入 Key 就只比词面，附录写明，不和带向量的旧结果比高低。

DOI 邻域只连接库内两边都有的 DOI。它不代替语义召回。无 DOI 的文献不进邻域，也不为它们猜边。换一种说法才能找到的论文，在有向量之前不承诺能找到。

### 0.5 晋级与回退

```text
影子试跑（热化学）→ 金句 + 跨栏句 → 通过才 --promote 第一段
→ 写作仍吃 1000/200，只是字干净了
→ 再开第二段影子 → 证据含金句比例 + 一节接地 → 通过才改写作拼上下文
```

一次只晋级一个分类。`--promote` 同时换上该分类的索引和向量；换不上向量就保持该分类纯词面，并保留旧 `.emb` 的副本到 `data/shadow/rollback/`。其它分类不碰。换上之后先过一个完整白天，确认写作、备文献、检索都正常，下一夜才动下一个分类。

第二段改的是拼上下文的代码，但按块的 `metadata.unit` 分支：没有 `proposition` 的分类仍走现在的 1000/200 拼接。因此深夜发布这版代码时，还没晋级的分类写法不变。

### 0.6 白天照常用，深夜才替换

站点白天给人写作、备文献、检索。重活不和这些请求抢 4 核 8 GB。

| 时段 | 允许 | 禁止 |
|------|------|------|
| 白天（05:00–24:00，北京时间） | 照常写作和上传。金句由人抄录、对照已经产好的影子。看上一夜的附录 | 解析 PDF、重切、嵌入、MinerU / GROBID、`--promote`、`pm2 reload` |
| 深夜（00:30–05:00） | 一个分类的影子抽取或失败页补文本或向量或晋级。到 05:00 没跑完就停，下一夜从断点续 | 第二个分类。全库。和写作请求并行打满 CPU |

索引在进程里有缓存（`LocalRAG` 按分类留在内存）。只换磁盘文件，已经打开的进程仍读旧块。所以晋级的最后一步才是 `pm2 reload grainscript`，而且要先看没有进行中的写作或 Agent 生成。有人还在写，这一夜就只把文件放进 `data/shadow/ready/`，reload 顺延到下一夜，不把写到一半的流打断。

白天若发现刚换上的那一类写坏了：把该分类的索引和 `.emb` 从 `data/shadow/rollback/` 换回，等当前写作请求结束再 reload。不在白天重切。回退只动这一类。

新上传的 PDF 仍走现在的增量。该分类还没晋级时，增量用旧阅读顺序。这一类已经晋级之后，新文件才用新阅读顺序；单篇增量可以在白天做，因为那是现在上传本来就会做的事，不是全类重切。

顺序：热化学一夜。第二天正常用。没有回退，再下一夜换下一个分类。第二段的代码和第一段的文件替换不要放在同一夜。

---

## 1. 现状（开工前不要再猜）

### 1.1 抽取与切块

| 事实 | 位置 |
|------|------|
| 文本来自 pdf.js `getTextContent`，整页按 Y 再按 X 排序 | `scripts/index-pdfs.mjs` `extractPageText`；`scripts/extractors/header-lines.mjs` `groupTextContentLines` |
| 双栏同一基线的左右栏字被拼成一行 | 同上。英文期刊句子从这里开始就是错的 |
| 切块是 `RecursiveCharacterTextSplitter` 1000 / 200，之前按短行标题分段 | `CHUNK_SCHEMA_VERSION = 2`（`scripts/lib/paper-section.mjs`） |
| 参考文献页用启发式整页跳过（第 3 页起） | `scripts/lib/index-text-filters.mjs` |
| 增量默认只看 PDF mtime。规则升级不会重切，除非 `--rechunk` 且 schema 变了 | `isStage1CacheFresh` |
| 全量 Stage 2 必须保留「扫描不到 PDF」的外部摘要块 | `docs/domain/rag-and-knowledge.md` 不变量 |
| `--skip-stage3` 禁止因新块没向量而删分类 `.emb` | RAG-PR-014 |
| 图不进索引。表变成错位的数字串。附件识图只覆盖用户上传的前几页 | `describe-pdf.ts`，与知识库索引无关 |

### 1.2 检索（2026-10-07 已落地，本计划在其上改，不重做）

| 已有 | 位置 |
|------|------|
| 中文连续词组加分；章节套话（「研究背景」等）不加分 | `src/lib/rag-rank.ts` |
| 写作与备文献 `paperFirst`，约 12 篇；聊天 / 大纲检索默认关 | `localRAG.search`；`writing-context.ts`；`search-knowledge.ts` |
| 篇分 = 块分的一部分 + 词组落在题名/正文；年份、被引、IF 只做很小乘数 | `paperPriority`。书目上的 `citedByCount` / `impactFactor` 已从 `KnowledgeFile.metrics` 带进 `BibEntry` |
| 蓝图本节主张 / 要点最多 3 条，分路检索再 RRF | `src/lib/writing-claims.ts`。预览 API 收 `claims` |
| 有主张时对前 12 段做一次短模型重排；`RAG_CLAIM_RERANK=0` 关闭；测试环境不调用 | `src/lib/rag-claim-rerank.ts` |
| 写作正式写节在摘要足够且主题对得上时跳过知识库 RAG | `shouldSkipKnowledgeRag` |
| 引用级 support / contradict / neutral 已存在，用在**写完后的校验**，不在检索出口 | `src/lib/citation-claim-grounding.ts` |

### 1.3 书目与邻域

- `KnowledgeBib.abstract` 可选。运行时 `BibEntry.bib` **没有**把摘要传到检索（`recordToBibEntry` 未映射 `abstract`）。篇卡现在主要靠题名。
- OpenAlex 客户端能拿单篇 `cited_by_count` 和摘要，**没有**把 `referenced_works` / 施引文献落成「只指向本库 DOI」的边。
- 无 DOI 的实验室 PDF 进不了邻域。这是数据缺口，不是漏做表。

### 1.4 机器与部署

- 站点用宿主机 PostgreSQL，不是空的 Docker `grainscript-db`。
- `data/`、`papers/` **不进部署包**。重建在服务器上跑，然后 `pm2 reload`。
- 约 4 核 8 GB。全库 Stage 1 与写作服务同时满载会抢内存。重切、补页、嵌入、晋级和 `pm2 reload` 只放在 §0.6 的深夜窗口，一次一个分类，第二天正常使用后再换下一类。

---

## 2. 完成后用户能感到的变化

第一段晋级之后，写作窗口里的英文双栏是一整句。检索条数、拼进 Writer 的形状、跳过知识库的条件，都和现在一样。

第二段晋级之后，才会变成下面这样。第二段没过，这些不出现在写作里。

- 写作拿到的证据句，和后来做引用接地的那句，是同一句。段落只作上下文，不拿整段去打分。
- 词面没撞上、但被项目里已有 DOI 文献引用的论文，可以进候选篇。无 DOI 的文献不会因此出现。
- 与主张相反的句子留在上下文里并标明「相反」，不混进支持材料。
- 简单数字表以「一张表」进入索引。结构对不齐的表丢掉。图仍然只靠图注文字，不识图。

评测分成两把尺子，都不能用另一把代替：

- **金句**：7 篇（5 篇英文双栏 + 2 篇中文单栏）每篇从 PDF 抄 3 句，影子文本必须对上。另加该分类跨栏句计数，必须为 0。
- **recall@10**：约 30 条真实主张，期望来源是否在前 10。只用来看守第二段有没有把该引的那篇弄丢，以及第一段晋级后来源召回没有下跌。recall 持平不能当作阅读顺序通过。

---

## 3. 明确不做

| 项 | 原因 |
|----|------|
| 全库裁图 + 视觉模型 | 描述会看错轴和单位，不能当引用数据。识图只留在附件路径 |
| 写作进程里或白天跑 GROBID / MinerU | 8 GB 会和写作抢内存。只允许在 §0.6 的深夜、写作进程之外、单进程，给金句或跨栏失败的页补文本。补完仍失败就留旧句 |
| 自建稠密+稀疏大模型、pgvector | 效果增量主要在切块和重排，不在把文件搬进数据库 |
| 无 DOI 文献的引用图 | OpenAlex 对不上就不要猜 |
| 改 `KnowledgeChunk`、查重本地库比对 | 查重仍读空表。另开单，不绑在本计划 |
| 一夜换完全库，或白天重切 | 白天要照常写作。一夜只准备或换上一个分类，第二天用过再换下一个。知识库页不能一键重切线上索引 |
| 聊天、大纲、方向分析的检索默认改成 `paperFirst` | 那些调用方要的是主题词，不是一句主张 |

---

## 4. 影响面

| 面 | 会动 | 不动 |
|----|------|------|
| Stage 1 缓存 | schema 升到 3 后，`--rechunk` 把 v2 当过期 | 不改 mtime 增量的默认行为：不带 `--rechunk` 的上传仍只处理新文件 |
| `.emb` 下标 | 影子用自己的向量文件。`--promote` 时才换线上 `.emb`，旧文件先拷到 `data/shadow/rollback/`。没嵌上就不要删线上那份 | 禁止在影子试跑时删除线上 `.emb`。禁止删掉其它分类的 `.emb` |
| 外部摘要 | 全量写盘继续保留无 PDF 的摘要块，落在「外部摘要」 | 不把摘要块切成命题 |
| 写作上下文 | 第二段闸门通过之后，才改成命题 + 父段落，并带 support / contradict。在此之前 `writing-context.ts` 不改 | `shouldSkipKnowledgeRag` 的跳过条件不放宽。第一段晋级只换该分类索引里的字，不换条数和 prompt 形状 |
| 备文献 | `search_knowledge` 仍 `maxPerSource=1`，候选篇集合并邻域 | 精读某个 `sourceKey` 不收窄篇数、不走邻域 |
| 引用校验 | 检索出口的判定与写完后的 `evaluateCitationClaimGrounding` 共用判定词表，不共用同一次调用 | 不把检索判定写成导出硬门。导出仍看写完的正文 |
| 知识库 UI | 「按命题重切」走现有 reindex 菜单，二次确认，文案写明会让该分类向量失效 | 不新增管理员页 |
| 数据库 | 无新表。邻域是 `data/citation-neighbors.json`（可重建） | 不改 `schema.prisma` |
| 文档 | `docs/domain/rag-and-knowledge.md` 必改；备文献行为变则补 `docs/domain/agent.md` | 不改 `AGENTS.md` 热规则 |
| 测试 | 坐标排序、分句、篇卡、邻域过滤、重排假模型、schema 版本 | 不把需要全库 PDF 的用例放进默认 `vitest` |

---

## 5. 开工顺序

```text
PROP-00 登记队列
PROP-01～03 两把尺子（金句 + recall@10 基线）
PROP-10～14 横带分栏，结果只进影子
PROP-15 失败页离线补文本，补不上就留旧句
第一段晋级（热化学）——写作契约不变
PROP-20～26 命题切块（仍在影子）
PROP-30～34 篇卡（无摘要不编代理）
PROP-40～45 坐标认表
PROP-50～55 DOI 引用邻域（不代替向量）
PROP-60～64 重排与支撑/矛盾标记
第二段影子对比 → 通过才改写作拼上下文
PROP-70～73 手册与回退
```

PROP-10 与 PROP-01 可并行。PROP-15 只处理金句或跨栏失败的页。PROP-20 依赖第一段已经晋级（否则命题切在错句上）。PROP-40 依赖 PROP-10 的坐标行。PROP-50 可与命题切块并行，但不进第一段晋级。PROP-60 依赖命题输出形状。写作侧文件在第二段闸门通过前不改。

---

## 6. 任务

估时是一个人连续做的量级，不含线上全库等待时间。

### 6.0 登记

| ID | 任务 | 完成标准 |
|----|------|----------|
| PROP-00 | 在 `docs/ENGINEERING_OPTIMIZATION_QUEUE.md` 加一节，链到本文。状态随下面的单更新 | 队列里能找到本计划，且写明不做第 3 节那张表 |

### 6.1 评测尺（PROP-01～03）

没有尺就不要改切块。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-01 | 定义题库 JSON：`query`（主张原文）、`title`、`section`、`expectSources`（1～2 个 PDF 文件名或 DOI）、`note` | `src/lib/eval/rag-prop-fixtures.ts`（或 `data` 外的 `src/__tests__/fixtures/rag-prop-queries.json`，**不**把生产 PDF 放进 git） | 类型有单测：缺 `expectSources` 的题被拒绝 |
| PROP-02 | 只读脚本：从线上或本地 `AgentSession.snapshot` 抽出最近写节用过的主张 / 查询，生成待标注清单（JSON）。不写数据库 | `scripts/harvest-rag-prop-queries.mjs` | 对一份 fixture snapshot 能打出查询和当时命中的 source。文档写明标注人要补「该引哪篇」，不能把当时的命中当成金标 |
| PROP-03 | 跑分：对每题调用与写作相同的 `searchWritingRagChunks`（或抽出的纯查询参数），算 recall@10（期望 source 是否出现在前 10 个来源里）。默认 `vitest` 只用 3 条假想题 + 注入的假 `search`。真题库用 `RAG_PROP_EVAL=1` 才打到本地索引 | `scripts/eval-rag-prop.mjs`、`src/__tests__/lib/rag-prop-eval.test.ts` | 假想题断言稳定。真题库命令写进本文第 8 节。**先在当前索引上跑一遍，把数字记在本文附录，作为基线** |

基线没记下来之前，不开 PROP-20 的全库重切。

### 6.2 阅读顺序（PROP-10～15）

默认仍用 pdf.js 的字形坐标，结果只进影子。线上 `extractPageText` 在第一段 `--promote` 之前保持现在的排序。失败页才在写作进程之外单跑版面解析器。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-10 | 纯函数：一组 text item（`str` + `transform` + 宽度）→ 阅读顺序的行。先切横带：横跨版心的行单独成带。带内按 x 空隙分栏，栏数不写死。跨栏空隙的一句标 `crossColumn: true`，调用方不得把它写入正文。页眉页脚不在这函数里做 | `scripts/extractors/reading-order.mjs` | 单测：双栏同一 Y 先左后右；单栏与现排序一致；通栏标题不被拆进左栏；三栏按从左到右；跨栏句带失败标记 |
| PROP-11 | 影子抽取调用 PROP-10。`--promote` 之前不改线上 `extractPageText` 的排序，避免新上传的 PDF 先吃未过闸门的阅读顺序。书目解析只在影子里吃新行 | 影子入口；`header-lines.mjs` 的线上路径等晋级再切 | 单测：未加 `--promote` 时线上排序函数仍是现在的 Y 再 X。双栏夹具只断言影子输出 |
| PROP-12 | 页眉页脚：只看页面最上、最下一带。去掉数字后仍在 ≥3 页重复的行才删。正文中间的同句保留 | `reading-order.mjs` | 单测：三页相同期刊名被去掉；「Smith 等 / 12」这种只差页码的顶行被去掉；正文中间同一短语保留 |
| PROP-13 | 单栏中文夹具（短行、带内无 x 空隙）不得被切成两栏 | 同上单测 | 显式断言未分栏 |
| PROP-14 | 7 篇金句：每篇从 PDF 阅读器抄 3 句，对影子文本做规范化后的逐句包含。并统计这 7 篇的 `crossColumn` 句 | 夹具与记录写在本文件附录。生产 PDF 不进 git，只进页码和抄出的句子 | 英文 15 句全部命中且跨栏句为 0；中文 6 句命中且没有被劈开。失败则先调横带阈值，仍失败的页进 PROP-15，不进入第一段晋级 |
| PROP-15 | 失败页只在 §0.6 的深夜、写作进程外、单进程跑 MinerU 或 GROBID。05:00 到点就停，下一夜续。抽出的正文再过金句和跨栏检查。仍失败则影子该页保留现行索引的旧文本，附录记录文件名和页码 | `scripts/repair-reading-order-pages.mjs`（离线，不进写作请求） | 单测用假解析器：失败页回退旧句；通过的页替换影子。不调用则写作索引字节不变。脚本在窗口外启动则直接退出 |

### 6.3 命题切块（PROP-20～26）

检索打分的单位是句子。交给 Writer 的是该句所在段落（父块），避免模型只看到半句话却又拿 1000 字去匹配。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-20 | 分句用 `Intl.Segmenter`（`zh` 与 `en`）。句末标点才断。`；` 和 `;` 不断开。不因短于 15 字丢弃。纯函数包一层，便于单测 | `scripts/lib/sentences.mjs` | 单测：`et al.`、`Fig. 3`、`3.5%`、中文句号；一条用分号连接的中文主张保持一句；「见图 1。」保留 |
| PROP-21 | 第一段晋级仍走现有 1000/200，只换阅读顺序后的正文，写入 `data/shadow/`，不覆盖线上索引。第二段才把句子切成 chunk：`metadata.unit = "proposition"`，`metadata.parentId`，`metadata.parentText`（段落，截断到约 800 字），保留 `section` / `pageStart`。`crossColumn` 句不进命题，该页影子正文回退为现行索引的旧文本 | 影子写入函数从 `index-pdfs.mjs` 抽出；线上 Stage 2 在 `--promote` 之前不调用 | 一句一条；同一段共享 `parentId`。短句保留。影子目录缺少线上文件时测试仍只读线上 |
| PROP-22 | 影子缓存用 schema 3。线上 `isStage1CacheFresh` 在 `--promote` 之前仍认 v2，普通增量不重切旧 PDF，也不把 v2 当过期 | `paper-section.mjs`、影子状态文件 | 单测：只跑影子时线上 v2 缓存仍新鲜；`--promote` 之后该分类才要求 schema 3 |
| PROP-23 | 第二段闸门通过后才改写作拼上下文：排序对句子打分，Writer 看到父段落，段前附上命中的那句。闸门前只在影子查询函数里实现同一行为 | 影子查询；通过后才是 `src/services/writing-context.ts` | 单测：两条同父句只展开一次父段落。未晋级时 `searchWritingRagChunks` 的输出形状与现行测试一致 |
| PROP-24 | 父段落进 prompt 后，单次写入的上下文字符数设上限（沿用现在每节最多若干条来源；父段落按 800 字截断已在 PROP-21） | `writing-context.ts` | 不增加 `retrievalConfigs` 的条数。确认 `precise/balanced/extensive` 的 limit 含义仍是「条」而不是「篇」 |
| PROP-25 | 影子 chunk 与线上 `.emb` 下标对不齐时，只写影子向量或标记影子「待嵌」。不删除线上 `.emb`。`--promote` 且新向量已写好，才替换，并先把旧文件拷进 `data/shadow/rollback/` | `scripts/index-pdfs.mjs`、`src/__tests__/scripts/index-emb-io.test.ts` | 测试：影子重切不删除 A 或 B 的线上 emb 路径 |
| PROP-26 | 外部摘要块不走分句。全量 Stage 2 保留逻辑加一条测试或注释对照，防止命题改造时把「source 不在本次 PDF 扫描集合」的块丢掉 | `index-pdfs.mjs` | 用一份含摘要块的假 index 跑 Stage 2 合并函数（若现在只在脚本主流程里，先抽出纯函数再测） |

`metadata.parentText` 会让 `index_*.json` 变大（句子重复段落）。若单分类 JSON 超过现在的约 2 倍，改为只存 `parentId`，父段落放 `data/parents_<分类>.json`。PROP-21 实现时先估热化学一份的体积，再决定内嵌还是旁路。超过 2 倍就走旁路，避免把 8 GB 机器的检索加载打满。

### 6.4 篇卡（PROP-30～34）

篇的第一排序键是题名 + 摘要，不是「这篇里最高的那句 BM25」。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-30 | `BibEntry.bib` 增加可选 `abstract`，`recordToBibEntry` 从 `KnowledgeBib.abstract` 拷贝 | `src/lib/rag.ts`、`src/lib/knowledge-metadata.ts` | 单测：有摘要的记录能被 `resolveBibEntry` 读到摘要前 200 字 |
| PROP-31 | 没有 `KnowledgeBib.abstract` 的篇，篇卡只用题名，不从正文拼代理摘要。`bibEdited=true` 时不改书目 | `rag-rank.ts` 的篇分公式 | 单测：无摘要篇的排序与现行 `paperPriority` 一致 |
| PROP-32 | `paperPriority` 增加摘要词组命中，权重大于正文命中、小于题名命中。没有摘要的篇保持现在的公式 | `src/lib/rag-rank.ts` | 更新 `rag-rank.test.ts`：摘要含完整词组的篇，压过只在正文里蹭到双字的长综述 |
| PROP-33 | 写作检索的 `paperLimit` 仍为 12。邻域篇在 PROP-54 另加配额，不把 12 撑成 50 | `writing-context.ts` | 常量集中在一处，测试能改 |
| PROP-34 | 文档改「篇分」一句，避免和 PROP-32 的新权重矛盾 | `docs/domain/rag-and-knowledge.md` | 与代码同一批提交 |

### 6.5 简单表（PROP-40～45）

只收结构完整的表。收不稳就丢，宁缺毋滥。不识图。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-40 | 在分栏后的坐标行上检测表：连续 ≥3 行，每行 ≥3 个 x 簇，且多数簇像数字或短标签。输入是带 x 的 item，不是拼接字符串。对 `join(" ")` 之后的文本调用则拒绝 | `scripts/extractors/simple-table.mjs` | 单测：对齐的 4×3 数字表 → markdown 表。普通段落 → 空。错位行 → 拒绝整张。只喂拼接字符串的调用返回空并记「缺坐标」 |
| PROP-41 | 表前 2 行内、长度 &lt; 200 的「表 1 / Table 1」行当作标题，并入该 chunk 的开头 | 同上 | 单测 |
| PROP-42 | 命中的表不再走分句。`metadata.unit = "table"`，`content` 为 markdown。表区域的行从正文分句里剔除，避免同一数字既在表里又在破句里 | `index-pdfs.mjs` | 夹具页上命题条数不含表内数字 |
| PROP-43 | 检索时 table 块参与词面匹配，但 `paperFirst` 的正文词组加分不把整张表当成一句主张。写作上下文里表用代码块包住，并注明「表，勿把单元格改写成未出现的统计量」 | `rag-rank.ts`、`writing-context.ts`、写作 prompt 里一条约束（`src/lib/prompts` 或现有 writer 约束模块，只加一句） | prompt 快照测试若存在则更新 |
| PROP-44 | 图注：短行匹配 `^图\s*\d` / `^Fig(?:ure)?\.?\s*\d` 的，单独成 `metadata.unit = "caption"`，不送视觉模型 | `reading-order` 之后的分段 | 单测。不裁图、不调用 `describePdfPages` |
| PROP-45 | 附件识图路径加注释：知识库索引不调用它 | `describe-pdf.ts` 文件头 4 行 | 无行为变化 |

### 6.6 DOI 引用邻域（PROP-50～55）

只连接「本库里两边都有 DOI」的边。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-50 | 脚本：读 Prisma `KnowledgeFile.bib.doi`，对有 DOI 的调用 OpenAlex `works/doi:`，取 `referenced_works` 与最多 20 条施引（`cited_by` 过滤成本高，可用 `related_works` 作补充，**优先 referenced**）。用 polite pool（已有 `OPENALEX_MAILTO`）。失败记日志并跳过，不中断整批 | `scripts/build-citation-neighbors.mjs` | `--limit=5` 干跑能写出 JSON。无 mailto 时拒绝启动并提示 |
| PROP-51 | 输出 `data/citation-neighbors.json`：`{ "doi": ["doi", ...] }`，值只保留本库也存在的 DOI。每篇最多 15 条。文件可删除重跑 | 脚本 | 单测纯函数：OpenAlex id 与本地 DOI 对齐；库外 DOI 丢弃；超过 15 截断 |
| PROP-52 | 运行时懒加载该 JSON（没有文件则邻域为空，检索行为与现在相同） | `src/lib/citation-neighbors.ts` | 缺文件不抛 |
| PROP-53 | 给定本次 `paperFirst` 得到的 DOI 集合，把邻居 DOI 映回 PDF 文件名（经 `BibEntry`） | 同上 | 单测 |
| PROP-54 | 写作检索：主查询的 12 篇之外，最多再加 8 篇邻居。邻居不参与第一轮词面竞争；只在这 8 篇里用**同一主张**再搜命题，每篇最多 1 句，附在主结果之后 | `writing-context.ts` | 单测用假邻居表：主结果没有的邻居源会出现，且不超过 8 |
| PROP-55 | 备文献 `search_knowledge` 在按篇排序之后，用同一配额把邻居源标成 `why: "被已命中文献引用"`。不自动导入 | `search-knowledge.ts`、`docs/domain/agent.md` 一小节 | 现有「过宽主题只预览、不默认全选」测试仍绿 |

OpenAlex 限流：脚本串行、每次间隔 ≥200 ms，可断点续跑（JSON 里已有的 DOI 跳过）。不要在检索请求里打 OpenAlex。

### 6.7 重排与矛盾标记（PROP-60～64）

命题落地后，模型只调用一次，输入是句子不是 1000 字。

| ID | 任务 | 文件 | 完成标准 |
|----|------|------|----------|
| PROP-60 | 抽出 `judgePassages(claim, passages) -> { index, verdict }[]`，verdict 为 support / contradict / neutral。实现可调用现有 verifier 风格的 `callAINonStreaming`，但**不要**复用「校验整篇正文引用」的 prompt | `src/lib/rag-passage-judge.ts` | 注入假 judge 的单测：顺序按 support、neutral、contradict 稳定排列；contradict 不删除 |
| PROP-61 | `rerankChunksForClaims` 改为调用 PROP-60，删除第二套「只输出编号数组」的提示，避免两次模型调用 | `rag-claim-rerank.ts` | `RAG_CLAIM_RERANK=0` 与 `VITEST` 仍跳过。失败保持词面顺序 |
| PROP-62 | 写作上下文里 contradict 的句子前加固定标记「【相反结论，勿写成支持】」 | `writing-context.ts` | 单测 |
| PROP-63 | 无主张（没有蓝图 claim）时不做模型判定，只靠词面和篇卡 | `searchWritingRagChunks` | 单测：`claims` 为空不调用 judge |
| PROP-64 | 确认导出硬门仍只看写完的正文（`evaluateCitationClaimGrounding`），检索阶段的 contradict 不增加新的 block 码 | 读 `validate-citations.ts`，不改行为则在该文件注释一行 | `writing-qa` 现有用例不改期望 |

### 6.8 试跑与全库（PROP-70～73）

| ID | 任务 | 完成标准 |
|----|------|----------|
| PROP-70 | 热化学只写影子。先过金句和跨栏句 0，再 `--promote` 第一段（写作仍 1000/200）。recall@10 相对基线下跌则撤回这一分类。第二段另比「影子证据含金句的比例」和一节引用接地，不通过则不改 `writing-context.ts` | 两段数字都写进附录。金句失败不能靠 recall 持平放行 |
| PROP-71 | 第一段要和旧的向量结果比，就先把影子嵌完再比。`--promote` 时新向量和索引一起换。没有嵌入 Key 就只比词面，线上 `.emb` 留在 rollback 里，附录写明这次是纯词面 | 不对其它分类的 `.emb` 动手。没有新向量时不删线上向量 |
| PROP-72 | 深夜手册写进 `docs/domain/rag-and-knowledge.md` 的运维小节，不写进 `DEPLOY.md` 的主流程。窗口 00:30–05:00，一次一个分类，05:00 停、下一夜续。有进行中的写作或 Agent 生成则不做 `pm2 reload`。换上一类之后先过一个白天，再换下一类。第二段代码与第一段文件替换分属两夜。`data/` 不进部署包 | 命令可复制。写明白天禁止重切、嵌入和 reload |
| PROP-73 | 知识库页不提供绕过闸门的「立即重切线上索引」。重切只产生影子。晋级仍走脚本 `--promote`。默认按钮仍是现在的增量 | UI 测试沿用 `knowledge-reindex-menu`。菜单里看不到会覆盖线上索引的新按钮 |

---

## 7. 每单的共同验收

- 改了 `scripts/` 或 `src/lib/rag*.ts`：相关 `vitest` 绿。
- 改了检索行为说明：`docs/domain/rag-and-knowledge.md` 与代码同一提交。
- 改了备文献：`docs/domain/agent.md` 补一句。
- 不新增 Prisma 字段，故不必改 `DATA_MODEL.md`。若实施时发现必须入库，先停，回来改本计划，而不是直接加表。
- 不把生产 PDF、`.emb`、`citation-neighbors.json` 提交进 git。

---

## 8. 命令（实施时以代码为准，此处先占位）

```bash
# 基线（白天不要打索引；要跑时再设环境变量）
RAG_PROP_EVAL=1 npx tsx scripts/eval-rag-prop.mjs src/__tests__/fixtures/rag-prop-queries.json

# 从快照抽出待标注清单。命中不是金标
node scripts/harvest-rag-prop-queries.mjs snapshot.json

# 失败页补文本。窗口外直接退出，不读写索引
node scripts/repair-reading-order-pages.mjs

# 影子重建。窗口外直接退出。一次一个分类，只写 data/shadow
node scripts/shadow-reading-order.mjs --category=热化学
node scripts/shadow-reading-order.mjs --files=a.pdf,b.pdf
node scripts/shadow-reading-order.mjs --category=热化学 --resume

# 邻域（服务器，有 OPENALEX_MAILTO，且在深夜窗口）
node scripts/build-citation-neighbors.mjs
```

线上 `node scripts/index-pdfs.mjs --rechunk` 仍是现有增量/重切，会改线上索引。第一段晋级前不要用它换阅读顺序。影子函数在 `scripts/extractors/reading-order.mjs`，尚未接入这条命令。

Stage 3 是否随 `--files` 增量嵌入，以 `index-pdfs.mjs` 现有行为为准，不在本计划里新造一套嵌入管道。

---

## 9. 附录（实施时填写）

### 基线 recall@10

| 日期 | 索引 | 题数 | recall@10 | 备注 |
|------|------|------|-----------|------|
| 2026-10-07 | 未跑 | 3 条假想题仅单测 |  | 白天不打本地索引。真题与基线留到深夜窗口，且要先有人工 `expectSources` |

### 热化学重切后

| 日期 | recall@10 | 双栏抽查 | 向量 |
|------|-----------|----------|------|
|  |  | 7 篇里通过几篇 | 有 / 无 |

### 体积

| 分类 | 重切前 JSON | 重切后 JSON | 父段落内嵌还是旁路 |
|------|-------------|-------------|-------------------|
| 热化学 | 约 116 MB（2026-10-07 线上） |  |  |
