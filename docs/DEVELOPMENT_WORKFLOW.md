# 开发、提交与部署规范

> 面向「不写代码、主要通过 AI 改项目」的使用方式。  
> 部署唯一方案见 [DEPLOY.md](./DEPLOY.md)（本地 build → scp → apply.sh，含全部踩坑清单）。

---

## 1. 文档地图

| 文档 | 什么时候看 |
|------|------------|
| **本文** | 改功能、提交、上线前的总流程 |
| [AGENTS.md](../AGENTS.md) | AI 协作铁律、目录职责、技术栈 |
| [CODE_MAP.md](./CODE_MAP.md) | 改某个功能该动哪些文件 |
| [WORKFLOWS.md](./WORKFLOWS.md) | 写作 / RAG / 图表三条主流程 |
| [DEPLOY.md](./DEPLOY.md) | **唯一部署方案**（本地 build → scp → apply.sh）+ 踩坑清单 |

---

## 2. 本地开发（改功能前）

### 2.1 环境准备（一次性）

```powershell
cd d:\project\论文助手
npm install --legacy-peer-deps
npx prisma generate
npx prisma db push
cp .env.example .env   # Windows 可手动复制
# 编辑 .env，至少填 DEEPSEEK_API_KEY
npm run dev
```

浏览器打开 `http://localhost:3000`。

### 2.2 改代码的标准顺序

每次只做一个功能，按层从下往上改（与 `CLAUDE.md` 一致）：

```
1. src/contracts/   — 类型定义
2. src/services/    — API 封装（禁止在组件里直接 fetch）
3. src/hooks/       — React 状态与副作用
4. src/components/  — UI
```

**改前**：让 AI 先 `rg` 搜索相关引用，列出影响范围。  
**改后**：必须跑验证（见第 4 节）。

### 2.3 禁止事项（容易踩坑）

| 禁止 | 原因 |
|------|------|
| 在组件里直接 `fetch()` | 统一走 `src/services/` |
| 使用 `any` | 类型检查会失败 |
| 全量 PATCH 整个 Project | 用 sections 增量保存 |
| 改 `backup_*` 目录 | 历史备份，勿动 |
| 大文件里堆新逻辑 | `workbench/page.tsx`、`writing-panel.tsx` 优先拆到 hook/组件 |
| 把 `.env`、私钥、API Key 提交 Git | 已在 `.gitignore`，但仍需人工注意 |

### 2.4 删 API 路由后类型报错

若删除了 `src/app/api/.../route.ts`，本地 `.next/types` 可能仍引用旧路径，导致 `tsc` 失败：

```powershell
Remove-Item -Recurse -Force .next\types, .next\dev\types -ErrorAction SilentlyContinue
npx tsc --noEmit
```

---

## 3. Git 分支策略

```
main                 ← 可部署的稳定线（VPS 自动部署监听此分支）
  └── feature/xxx    ← 功能开发（推荐）
  └── cursor/xxx     ← Cursor 会话分支（当前常用）
```

| 场景 | 做法 |
|------|------|
| 日常改功能 | 在功能分支开发，验证通过后合并到 `main` |
| 小修复 | 可直接在 `main` 上改（单人项目可接受） |
| 清理 / 文档 / 部署配置 | 单独 commit，方便 review |

**不要**在没验证通过时 push 到 `main`（会触发线上自动部署）。

---

## 4. 提交前验证（质量闸门）

本地 Git 已配置 pre-commit：提交时自动跑 `tsc --noEmit`。

手动完整检查（推荐合并前跑一遍）：

```powershell
npm run check
# 等价于：typecheck + test + lint:src
```

| 命令 | 作用 |
|------|------|
| `npm run typecheck` | TypeScript 零错误 |
| `npm run test` | Vitest 单元测试 |
| `npm run lint:src` | ESLint（src 目录） |
| `npm run build` | 生产构建（合并大改前建议跑） |

**全部通过再 commit。**

---

## 5. 提交规范

### 5.1 Commit message 格式

与现有历史保持一致，中文简述即可：

```
feat: 新增 xxx 功能
fix: 修复 xxx 问题
chore: 清理脚本 / 归档文档
docs: 更新部署说明
refactor: 重构 xxx（无行为变化）
test: 补充 xxx 测试
```

一行标题为主；必要时第二段写「为什么改」。

### 5.2 提交步骤（PowerShell）

```powershell
git status
git add <要提交的文件>    # 不要 git add . 误提交 .env
git commit -m "feat: 简短说明"
git push origin <你的分支名>
```

### 5.3 合并到 main

**方式 A — GitHub 网页（推荐）**

1. Push 功能分支到 GitHub  
2. 打开 Pull Request → base 选 `main`  
3. 等 CI / 自测通过 → Merge  

**方式 B — 本地**

```powershell
git checkout main
git pull origin main
git merge <功能分支>
npm run check
git push origin main
```

合并到 `main` 后，若已配置 VPS 自动部署，**约 5～10 分钟**线上会更新。

---

## 6. 部署方式（唯一）

| | 生产 VPS（唯一方案） |
|--|---------------------|
| 文档 | [DEPLOY.md](./DEPLOY.md) |
| 流程 | 本地 `npm run build` → `package.sh` 打包 → scp → 服务器 `apply.sh`（nohup） |
| 数据库 | PostgreSQL Docker（`grainscript-db`，`127.0.0.1:5432`） |
| 进程 | PM2 `grainscript`（1 fork，`node server.js`） |
| 已废弃 | ~~git push 自动部署~~、~~Docker VPS 构建~~、~~pm2-up.sh~~（勿再用） |

完整步骤 + 踩坑清单见 [DEPLOY.md](./DEPLOY.md)。

---

## 7. 腾讯云自动部署架构（你要理解的 3 件事）

```text
你 push 到 main
    ↓
GitHub Actions SSH 登录 VPS
    ↓
git pull + scripts/deploy/vps-up.sh
    ↓
VPS 上 docker compose build + up（不拉镜像仓库，零额外费用）
```

相关文件（需在 `main` 上存在才会生效）：

| 文件 | 作用 |
|------|------|
| `.github/workflows/deploy.yml` | CI：SSH 触发 VPS 部署 |
| `docker-compose.prod.yml` | 生产 compose（PostgreSQL + 本地 build） |
| `scripts/deploy/vps-up.sh` | VPS 上 build 并重启 |
| `scripts/deploy/bootstrap-vps.sh` | VPS 首次初始化 |

> **当前状态**：上述部署文件已在本地写好，但**尚未 merge 到 `main`**。第一次上线前需要先提交并合并。

---

## 8. 第一次配置部署：你需要准备什么

下面分「必须你本人操作」和「可以交给 AI / 文档」两类。

### 8.1 必须你本机完成（敏感信息，不要发聊天）

| # | 事项 | 怎么做 | 存到哪里 |
|---|------|--------|----------|
| 1 | **SSH 私钥** | 本机 `E:\Edownload\cursor.pem` | 仅本机（scp/ssh 用），**不必**存 GitHub |
| 2 | **VPS 上的 `.env`** | SSH 登录，`nano /home/ubuntu/grainscript/.env` | 仅存在于 VPS，不进 Git |
| 3 | **`JWT_SECRET`** | 随机字符串（见下方命令） | VPS 的 `.env` |
| 4 | **`DEEPSEEK_API_KEY`** | DeepSeek 控制台申请 | VPS 的 `.env`（本地 `.env` 也要有） |

生成 `JWT_SECRET`：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

验证 SSH 私钥能否登录 VPS：

```powershell
ssh -i E:\Edownload\cursor.pem ubuntu@159.75.106.21
```

### 8.2 部署所需（唯一方案）

本地 scp 方案**不依赖 GitHub Actions / Secrets**。只需：

| 项 | 值 |
|----|-----|
| 本机私钥 | `E:\Edownload\cursor.pem` |
| 服务器 | `ubuntu@159.75.106.21`，应用目录 `/home/ubuntu/grainscript` |
| 部署脚本 | `scripts/deploy/package.sh`（打包）、`scripts/deploy/apply.sh`（服务器解压+依赖+prisma+pm2） |

### 8.3 VPS 上一次性初始化

用网页终端或密码 SSH 登录后，确认 `/home/ubuntu/grainscript/.env` 已配置（首次部署时由 apply.sh 解压出应用目录，`.env` 需手动建）：

```bash
nano /home/ubuntu/grainscript/.env
# 填 JWT_SECRET、DEEPSEEK_API_KEY、DATABASE_URL（127.0.0.1:5432）、RAG_ARTICLES_DIR
```

完整变量见 [DEPLOY.md](./DEPLOY.md) §五。

腾讯云安全组放行：**22**（SSH）、**3000**（HTTP，或以后改 Nginx 80/443）。

### 8.4 上线需要做的（可让 AI 帮你）

1. 按 `AGENTS.md` 提交代码（功能与 `docs/` 同 commit）
2. 按 [DEPLOY.md](./DEPLOY.md) 唯一流程部署：`npm run build` → `package.sh` 打包 → scp → `apply.sh`（nohup）→ 轮询日志
3. 浏览器访问 `https://ai4science.hyxhhh.site` 冒烟测试

> 已废弃：`.github/workflows/deploy.yml`（`workflow_dispatch` 手动触发，本地 scp 已覆盖）、`docker-compose.prod.yml`（已移除）。

### 8.5 你**不需要**交给 AI 的东西

- SSH **私钥**、服务器**密码**、API Key 全文  
- 若曾在聊天里发过密码 → 请到腾讯云**立即改密**

私钥只在本地 `E:\Edownload\cursor.pem` 用（scp/ssh），不必存进 GitHub。

---

## 9. 日常发布 Checklist

每次要上线新功能，按 [DEPLOY.md](./DEPLOY.md) 唯一流程：

- [ ] 本地 `npm run check` 通过（tsc + vitest + eslint）
- [ ] 功能与对应 `docs/` **同一个 commit**
- [ ] `npm run build` 成功，记下 `.next/BUILD_ID`
- [ ] `bash scripts/deploy/package.sh` 打包，`tar -tzf deploy.tar.gz | grep -c '\.next/BUILD_ID'` 非 0
- [ ] scp 上传 → ssh nohup `apply.sh` → 轮询 `/tmp/grainscript-deploy.log` 见 `PREFLIGHT PASSED` + HTTP 检查
- [ ] `curl localhost:3000` 200、`cat .next/BUILD_ID` 与本地一致、grep 新功能字符串命中
- [ ] 打开 `https://ai4science.hyxhhh.site` 冒烟（登录 → 打开项目 → Agent 扩写/收集文献 → 图表）

部署失败（HTTP 500 / 启动报错）时：看 `pm2 logs grainscript --lines 40`，对照 [DEPLOY.md](./DEPLOY.md) §四 踩坑清单（最常见：Turbopack Prisma hash 断裂、打包漏 `.next`、SSH 限流）。

---

## 10. 数据备份（生产）

| 数据 | 位置 |
|------|------|
| 知识库索引 | VPS `/home/ubuntu/grainscript/data/` |
| 文献 PDF | VPS `/home/ubuntu/grainscript/papers/` |
| 图表输出 | VPS `/home/ubuntu/grainscript/public/charts/` |
| PostgreSQL | Docker volume `pgdata`（`grainscript-db`） |

用 `scripts/backup.sh`（日备 `.env`+sql.gz，周备 `papers/`），详见 [DEPLOY.md](./DEPLOY.md) §七。

---

## 11. 和 AI 协作时的标准话术

**改功能：**

> 目标：只实现 xxx。先 rg 影响范围，按 contracts → services → hooks → components 顺序改，改完跑 npm run check。

**提交：**

> 帮我只提交 xxx 相关文件，写 commit message，不要提交 .env。

**部署：**

> 按 docs/DEPLOY.md 唯一流程部署（本地 build → 打包 → scp → apply.sh），先跑 npm run check。

---

## 12. 常见问题

**Q: push 了但线上没变？**  
只有 push 到 **`main`** 才触发部署；功能分支 push 不会上线。

**Q: commit 被 pre-commit 拦住？**  
看 `tsc` 报错；若删了 API 路由，清 `.next/types` 再试。

**Q: 本地 SQLite，线上 PostgreSQL，会冲突吗？**  
开发用本地 `.env` 的 SQLite；生产由 `docker-compose.prod.yml` 覆盖为 PostgreSQL。Schema 变更需 `prisma migrate` / `db push` 并在镜像构建时生效。

**Q: 还想在服务器上手动 build？**  
可以，用 [DEPLOY.md](./DEPLOY.md) 的 `docker compose up -d --build`，但慢，不推荐。
