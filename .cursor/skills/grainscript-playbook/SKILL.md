---
name: grainscript-playbook
description: 禾书耕文一条功能怎么走、什么时候写代码、什么时候提交或上线。用户问开发闭环、快速开发流程、提交、推代码、部署、上线，或说「提交」「推上去」「上线」「部署」时必须使用。也用于实现完成之后、提交之前的闸门。不负责功能做不做（那是 grainscript-feature），不复制部署步骤。禁止 alwaysApply。
---

# grainscript-playbook

一条功能的默认路径。本 skill 只做路由，不覆盖 `AGENTS.md` 热规则，也不把部署手册抄进来。

```text
grainscript-feature（规格；范围已钉死可跳过）
→ 读对应 docs/domain 与 AGENTS.md 热规则
→ 按 docs/VIBECODING.md 写代码
→ 动界面则在浏览器走通主路径
→ npm run check
→ 只有用户明确说提交或上线，才走 docs/DEVELOPMENT_WORKFLOW.md 与 docs/DEPLOY.md
```

没说提交或上线，就停在本地验证。不要主动 commit，不要 push `main`。

## 用户说什么，走哪里

| 用户说 | 走 |
|--------|----|
| 做一个、加功能、改流程、先出方案，范围未钉死 | `.cursor/skills/grainscript-feature/SKILL.md` |
| 范围已钉死，开始写 | 先读该功能对应的 `docs/domain/`，再按 `docs/VIBECODING.md` |
| 改界面、改布局、改交互 | 先复用现有工作台组件与 hook；改完在浏览器走通主路径。开发服务器不能代替这次验收 |
| 改 Prisma 表或字段 | 先对 `docs/DATA_MODEL.md` 与 `prisma/schema.prisma`，不猜字段。改完更新数据模型并 `npx prisma generate` |
| 改 API 路由 | `npm run docs:api-index`，并按 `AGENTS.md` S0 同步受影响文档 |
| 提交、推上去 | `docs/DEVELOPMENT_WORKFLOW.md`。验证通过再 commit。`main` 会触发线上部署，未验证不要推 `main` |
| 上线、部署 | 提交已经在目标分支之后，再按 `docs/DEPLOY.md`。只要求改功能时不要部署 |

提交文案保持仓库现有风格：`feat` / `fix` / `docs` 等，中文简述，必要时第二句写为什么。用户没明确要求提交时，到验证为止。

## 不要做的事

- 把本 skill 或长流程文设为始终生效。热规则留在 `AGENTS.md`，域规则留在 `docs/domain/`。
- 为了一次改完去拆仓库，或照搬别的项目的分仓、直推 `main`、视觉系统和部署平台。
- 用长期开着的 `npm run dev` 代替 `npm run check` 和浏览器主路径。
- 人控写作与 Agent 各做一套。同一能力两条入口行为一致，并回答挂在工作台哪条路径、要不要写入 Passport。
