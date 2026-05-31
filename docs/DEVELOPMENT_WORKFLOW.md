# 开发、提交与部署规范

> 面向「不写代码、主要通过 AI 改项目」的使用方式。  
> 详细部署步骤见 [DEPLOY_VPS.md](./DEPLOY_VPS.md)，配置清单见 [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)。

---

## 1. 文档地图

| 文档 | 什么时候看 |
|------|------------|
| **本文** | 改功能、提交、上线前的总流程 |
| [AGENTS.md](../AGENTS.md) | AI 协作铁律、目录职责、技术栈 |
| [CODE_MAP.md](./CODE_MAP.md) | 改某个功能该动哪些文件 |
| [WORKFLOWS.md](./WORKFLOWS.md) | 写作 / RAG / 图表三条主流程 |
| [DEPLOY.md](./DEPLOY.md) | 实验室本机 Docker（`docker compose build`） |
| [DEPLOY_VPS.md](./DEPLOY_VPS.md) | 腾讯云 VPS 自动部署（推 main 即发布） |
| [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md) | 第一次配部署时逐项打勾 |

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

## 6. 两种部署方式对比

| | 实验室本机 | 腾讯云 VPS（推荐线上） |
|--|-----------|------------------------|
| 文档 | [DEPLOY.md](./DEPLOY.md) | [DEPLOY_VPS.md](./DEPLOY_VPS.md) |
| 触发 | 手动 `docker compose up -d --build` | `git push origin main` |
| 构建位置 | 本机 / 服务器本地 build | GitHub Actions 云端 build |
| 数据库 | SQLite（`.env` 默认） | PostgreSQL（`docker-compose.prod.yml`） |
| 适用 | 局域网试用、调试 Docker | 公网访问、免手搓 rebuild |

---

## 7. 腾讯云自动部署架构（你要理解的 3 件事）

```text
你 push 到 main
    ↓
GitHub Actions 在云端 docker build
    ↓
镜像推到 ghcr.io/hyxhhh1013/grainscript:latest
    ↓
Actions SSH 登录 VPS，执行 scripts/deploy/vps-up.sh
    ↓
VPS 只 docker pull + compose up（不在服务器编译）
```

相关文件（需在 `main` 上存在才会生效）：

| 文件 | 作用 |
|------|------|
| `.github/workflows/deploy.yml` | CI：构建 + SSH 部署 |
| `docker-compose.prod.yml` | 生产 compose（PostgreSQL + 拉镜像） |
| `scripts/deploy/vps-up.sh` | VPS 上拉镜像并重启 |
| `scripts/deploy/bootstrap-vps.sh` | VPS 首次初始化 |

> **当前状态**：上述部署文件已在本地写好，但**尚未 merge 到 `main`**。第一次上线前需要先提交并合并。

---

## 8. 第一次配置部署：你需要准备什么

下面分「必须你本人操作」和「可以交给 AI / 文档」两类。

### 8.1 必须你本机完成（敏感信息，不要发聊天）

| # | 事项 | 怎么做 | 存到哪里 |
|---|------|--------|----------|
| 1 | **SSH 私钥** | 腾讯云下载的 `.pem`（与公钥 `skey-qxuyis6t` 配对），或新建 `deploy_key` | GitHub Secret：`DEPLOY_SSH_KEY` |
| 2 | **GHCR 拉镜像 Token** | GitHub → Settings → Developer settings → Fine-grained PAT，权限 `read:packages` | GitHub Secret：`GHCR_PULL_TOKEN` |
| 3 | **VPS 上的 `.env`** | SSH 登录服务器，`nano /opt/grainscript/.env` | 仅存在于 VPS，不进 Git |
| 4 | **`JWT_SECRET`** | 随机字符串（见下方命令） | VPS 的 `.env` |
| 5 | **`DEEPSEEK_API_KEY`** | DeepSeek 控制台申请 | VPS 的 `.env`（本地 `.env` 也要有） |

生成 `JWT_SECRET`：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

写入 GitHub Secret（私钥示例，路径改成你的 `.pem`）：

```powershell
gh secret set DEPLOY_SSH_KEY < C:\Users\你的用户名\Downloads\skey-qxuyis6t.pem
gh secret set GHCR_PULL_TOKEN
# 粘贴 PAT 后回车
```

验证 SSH 私钥能否登录 VPS：

```powershell
ssh -i C:\path\to\your-key.pem ubuntu@159.75.106.21
```

### 8.2 已替你配好的 GitHub Secrets

| Secret | 值 |
|--------|-----|
| `DEPLOY_HOST` | `159.75.106.21` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_PATH` | `/opt/grainscript` |

### 8.3 VPS 上一次性初始化

用腾讯云网页终端或密码 SSH 登录后，见 [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md) 中的 bootstrap 命令。

完成后在 VPS 上：

```bash
nano /opt/grainscript/.env
# 填 JWT_SECRET、DEEPSEEK_API_KEY
```

腾讯云安全组放行：**22**（SSH）、**3000**（HTTP，或以后改 Nginx 80/443）。

### 8.4 还需要在 Git 里完成的（可让 AI 帮你 commit + PR）

1. 把 `.github/workflows/deploy.yml`、`docker-compose.prod.yml`、`scripts/deploy/`、部署文档 **提交并 merge 到 `main`**
2. Push 后打开 GitHub → **Actions** → 看 `Deploy to VPS` 是否成功
3. 浏览器访问 `http://159.75.106.21:3000`

### 8.5 你**不需要**交给 AI 的东西

- SSH **私钥**、服务器**密码**、API Key 全文  
- 若曾在聊天里发过密码 → 请到腾讯云**立即改密**

公钥可以公开；私钥和 Token 只用 `gh secret set` 或 VPS 本地编辑。

---

## 9. 日常发布 Checklist

每次要上线新功能：

- [ ] 本地 `npm run check` 通过  
- [ ] 功能分支已 merge 到 `main`  
- [ ] GitHub Actions `Deploy to VPS` 绿色成功  
- [ ] 打开 `http://159.75.106.21:3000` 冒烟测试（登录 → 打开项目 → 试一次 AI 写作）  

Actions 失败时：

1. 看 Actions 日志是 **build 失败** 还是 **SSH/deploy 失败**  
2. Build 失败 → 本地 `npm run build` 复现  
3. SSH 失败 → 检查 Secret、安全组 22、VPS `authorized_keys`  
4. Pull 401 → 配置 `GHCR_PULL_TOKEN` 或把 GHCR Package 设为 Public  

紧急手动部署（Actions 挂了）见 [DEPLOY_VPS.md](./DEPLOY_VPS.md) 第四节。

---

## 10. 数据备份（生产）

| 数据 | 位置 |
|------|------|
| 知识库索引 | VPS `/opt/grainscript/data/` |
| 图表输出 | VPS `/opt/grainscript/public/charts/` |
| PostgreSQL | Docker volume `pgdata` |

备份数据库：

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U grainscript grainscript > backup.sql
```

---

## 11. 和 AI 协作时的标准话术

**改功能：**

> 目标：只实现 xxx。先 rg 影响范围，按 contracts → services → hooks → components 顺序改，改完跑 npm run check。

**提交：**

> 帮我只提交 xxx 相关文件，写 commit message，不要提交 .env。

**部署：**

> 帮我把部署相关文件单独 commit，并说明 merge 到 main 前我还缺哪些 Secret。

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
