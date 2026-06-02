# 核心项目规则与维护规范

## 1. 代码维护性规则 (Maintainability)
*   **原子化组件**：UI 组件必须保持单一职责，单个文件原则上不超过 200 行。
*   **Service 层隔离**：所有 API 调用（Fetch/Axios）必须封装在 `@/services` 目录下，禁止在组件内直接写 API 请求逻辑。
*   **严格类型**：严禁使用 `any`，所有业务数据必须定义 TypeScript Interface/Type。
*   **环境变量规范**：敏感信息（API Keys, Database URLs）严禁提交代码库，统一使用 `.env.local`。

## 2. 可扩展性规则 (Scalability)
*   **工作流抽象**：Dify 中的 AppID 和 API Key 需按业务功能模块化配置，方便未来增加“烟草版”、“水稻版”等独立子系统。
*   **插件化设计**：数据解析模块（Excel/CSV）需支持多种 Parser 扩展，以便未来兼容更多实验室原始格式。

## 3. 文档与协作规范
*   **Vibecoding 友好**：所有核心逻辑变更需同步更新 `.cursorrules`，确保 AI 辅助编程时能遵循最新架构。
*   **注释规范**：复杂的业务逻辑（如 RAG 评分权重调整）必须在代码中详细注释“Why”而非“How”。

## 4. 自动化与质量
*   **Pre-commit Hooks**：提交代码前强制进行 ESLint 和 Prettier 校验。
*   **部署自动化**：通过简单的 Shell 脚本实现一键 Pull 代码并重启 Docker 容器。
*   **API 入参校验**：Route Handler 写操作统一走 `@/lib/api-validate` 的 `validateBody` + `@/lib/validations` 中的 Zod schema；FormData JSON 字段用 `parseOptionalJsonConfig`。
