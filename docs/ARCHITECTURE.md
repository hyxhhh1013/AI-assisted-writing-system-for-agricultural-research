# 技术架构选型文档

## 1. 架构总览
本系统采用 **“现代前端 (Next.js) + 低代码 AI 中台 (Dify) + 云端大模型 (DeepSeek/Qwen)”** 的三层架构，兼顾开发速度与运维成本。

## 2. 技术栈清单 (Tech Stack)

### 2.1 前端展示层 (Frontend)
*   **框架**：Next.js 14+ (App Router) —— 提供极佳的 SEO（虽然本项目内网用不到，但为了路由规范）和 SSR 性能。
*   **样式**：Tailwind CSS —— 快速构建响应式 UI。
*   **组件库**：Shadcn UI —— 现代、简洁的 UI 组件。
*   **状态管理**：Zustand —— 轻量级状态同步。

### 2.2 核心业务层 (BFF/AI Orchestration)
*   **平台**：Dify (Self-hosted via Docker) —— 负责 RAG 工作流、知识库管理、Prompt 编排。完全免费且确保数据隐私。
*   **后端逻辑**：Next.js Route Handlers —— 处理前端与本地 Dify API 的对接。

### 2.3 数据与 AI 层 (Data & LLM)
*   **大语言模型**：DeepSeek-V3 / Qwen-Max —— 负责高阶推理与文本生成。
*   **向量数据库**：Qdrant / Milvus (由 Dify 内置管理) —— 存储文献向量。
*   **关系型数据库**：PostgreSQL (由 Dify 依赖) —— 存储对话记录与配置。

## 3. 核心设计原则
*   **AI 逻辑下沉**：前端不写 Prompt，所有 Prompt 固化在 Dify 或后端 Service 中。
*   **流式响应 (Streaming)**：所有生成接口必须支持 Stream 输出，提升用户体验。
*   **API 抽象层**：前端通过统一的 `/api/ai` 接口调用，屏蔽底层 Dify 或 LLM 的变更。

## 4. 部署方案
*   **开发环境**：本地 Docker Compose 快速启动 Dify + 前端开发服务器。
*   **生产环境**：实验室轻量云服务器 (4核16G)，Docker 容器化部署。
