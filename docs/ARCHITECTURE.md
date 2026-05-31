# 架构文档：禾书耕文 (GrainScript)

## 项目定位

面向农业/热化学/生物质能科研领域的 AI 辅助 SCI 论文写作平台。利用实验室自有 167 篇 PDF 文献构建私有知识库，驱动 LLM 撰写符合实验室行文风格和学术规范的论文。

**一人全栈开发，132 个源文件，10 个数据模型，32 个 API 端点。**

## 技术栈

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| 框架 | Next.js 16 App Router | 同构架构——页面渲染和 API 共享一套代码，单人开发不用拆前后端 |
| 语言 | TypeScript 5 | 类型安全，尤其在 AI 输出不确定性的场景下 |
| 样式 | Tailwind CSS v4 + Shadcn UI | 开箱即用，不需要自己维护设计系统 |
| 数据库 | Prisma + PostgreSQL | Docker Compose 提供本地 `db` 服务，部署环境与开发环境保持一致 |
| 认证 | JWT (jose + bcryptjs) | 轻量，HTTP-only cookie 防 XSS |
| AI 调用 | 自研 fetch 封装 | 绕过 LangChain 抽象层，直接调 API，可控性更高 |
| RAG | 自研 BM25 + 向量混合检索 + RRF 融合 | 专为中文+英文学术文献检索引擎调优 |

## 核心架构决策

### 1. 多 Agent 写作管道（Writer → Verifier → Refiner）

```
Writer (DeepSeek) ──→ Verifier (智谱 GLM-4-Plus) ──→ Refiner (DeepSeek)
      ↓                         ↓                         ↓
 SSE 流式输出              逐条核实引用真实性          根据审查意见修正
```

**为什么是三段式？**

单一 LLM 写论文有两个致命问题：
- **幻觉引用**：AI 编造不存在的参考文献
- **自我审查无效**：同一个模型无法有效审查自己的输出

**设计决策：Writer 和 Verifier 用不同厂商的模型**（DeepSeek vs 智谱）。只有不同模型才能真正实现独立验证。如果智谱 API 不可用，自动降级回 DeepSeek（用不同的 temperature）。

### 2. 混合 RAG 检索引擎

```
查询 ──→ BM25 词汇检索 ──┐
         (单字/双字/三字分词)  │
                             ├──→ RRF 融合排序 ──→ 去重 ──→ 分类过滤 ──→ Top-K 结果
查询 ──→ 向量语义检索 ──┘
         (DeepSeek Embedding)
```

**为什么不直接用 Pinecone/Milvus/Chroma？**
1. 零部署成本：本地 JSON 索引，不需要运维向量数据库
2. 混合检索：纯向量检索对中文专业术语（"热重分析"、"比表面积"）效果差——BM25 的精确匹配更准
3. 来源去重：每篇文献最多 4 条——防止某一篇文献垄断检索结果

### 3. 引用真实性验证

不是简单的"检查格式"，而是**比对被引用文献的完整原文**：

1. 正则提取正文中所有 `[n]` 引用标记
2. 对每条引用，从 RAG 知识库检索被引用文献的完整原文
3. Verifier 逐条比对：引用表述 vs 原文实际内容
4. 输出：✅ 通过 / ⚠️ 归属错误 / ❌ 疑似虚构

## 数据模型（10 个表）

```
User ──→ Project ──→ Section (IMRaD 章节)
                 ├──→ Reference (参考文献列表)
                 ├──→ AnalysisResult (数据分析结果)
                 ├──→ PlagiarismCheck ──→ PlagiarismMatch (查重匹配)
                 │                   └──→ RewriteSuggestion (降重建议)
                 └──→ ReferenceSource (引用编号→文献源映射)

KnowledgeFile ──→ KnowledgeChunk (文献分块+向量)
```

## 面试要点速查

被问到项目时按这个路径讲：

1. **问题**：实验室 SCI 论文——查重难、引用管理乱、AI 写出来不符合规范
2. **方案**：私有知识库 RAG + 多 Agent 写作管道 + 引用真实性验证
3. **技术亮点**：混合检索（BM25+向量+RRF）、不同模型独立审查、SSE 流式管道、DOCX 多模板导出
4. **工程能力**：TypeScript 全栈、一人交付 132 源文件、自研 RAG 引擎、12 个 AI 端点限流+认证
5. **用户意识**：为实验室真实需求而建，不是 demo——在有人用之前暂停加新功能
