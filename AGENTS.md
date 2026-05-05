<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 农业科研 AI 辅助系统 - 开发与协作规范

为了确保项目在 AI 辅助编程（Vibecoding）模式下的可维护性与一致性，所有 AI 代理必须遵循以下规则：

## 1. 代码架构规范
*   **彻底解耦**：禁止在页面或组件中直接编写数据请求逻辑。所有 API 调用必须封装在 `src/services` 中。
*   **原子化组件**：UI 组件必须保持单一职责。严禁编写超过 200 行的超大组件文件。
*   **严格类型约束**：严禁使用 `any`。所有数据流转（API 返回值、组件 Props、Store 状态）必须定义显式的 TypeScript Interface 或 Type。
*   **流式输出 (Streaming)**：所有 AI 生成相关的接口必须支持 Stream 模式，前端需实现对应的流式解析逻辑。

## 2. 目录结构约定
*   `src/services`: 存放所有外部 API（如 Dify）的调用逻辑。
*   `src/store`: 使用 Zustand 进行全局状态管理。
*   `src/components/ui`: 存放 Shadcn UI 原始组件。
*   `src/components/shared`: 存放业务通用的复用组件。
*   `src/app/api`: 存放 Next.js Route Handlers。

## 3. 环境变量与安全
*   严禁将 `.env` 或 `.env.local` 提交至 Git 仓库。
*   敏感配置（API Key, Base URL）统一通过 `process.env` 在服务端读取。

## 4. Dify 集成规范
*   使用 `DifyService` 类处理通信。
*   所有业务 Prompt 必须在 Dify 后台编排，前端仅传递变量（Inputs）。
