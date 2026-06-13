# 部署配置清单

> 主文档：[DEPLOY.md](./DEPLOY.md)  
> **推荐部署路径**：`git push origin main` 触发 Actions（方式 A）。本地 SCP 备用见方式 B。全 Docker 见 [DEPLOY_VPS.md](./DEPLOY_VPS.md)，勿与 PM2 混用 `DATABASE_URL` 主机名。

## 当前方案

**VPS 生产环境**：PM2 + Node.js standalone（PostgreSQL 用 Docker，应用在宿主机）

| 项目 | 值 |
|------|-----|
| 服务器 IP | `159.75.106.21` |
| 用户 | `ubuntu` |
| 应用目录 | `/home/ubuntu/grainscript/` |
| 数据库 | PostgreSQL Docker（`grainscript-db`，映射 **127.0.0.1:5432**） |
| 进程管理 | PM2（`grainscript`，**1 实例 fork**，见 `ecosystem.config.cjs`） |
| 域名 | aifascience.site（Nginx → localhost:3000） |
| GitHub | `hyxhhh1013/AI-assisted-writing-system-for-agricultural-research` |

## 部署方式

### 方式 A：`git push` 自动部署（日常推荐）

```bash
git checkout main
git merge your-feature-branch
git push origin main
```

GitHub Actions（`.github/workflows/deploy.yml`）在云端 build → 上传 `deploy.tar.gz` → `apply.sh` → **preflight** → `pm2 reload`。

**仓库 Secrets**（Settings → Secrets and variables → Actions）：

| Secret | 必填 | 说明 |
|--------|------|------|
| `DEPLOY_HOST` | 是 | VPS 公网 IP，如 `159.75.106.21` |
| `DEPLOY_USER` | 是 | SSH 用户，如 `ubuntu` |
| `DEPLOY_SSH_KEY` | 是 | 私钥全文（与 VPS `authorized_keys` 对应） |
| `DEPLOY_PATH` | 否 | 应用目录，默认 `/home/ubuntu/grainscript` |
| `DEPLOY_PORT` | 否 | SSH 端口，默认 `22` |

进度：**Actions → Deploy to VPS (PM2)**。失败时看日志；也可 **Run workflow** 手动重发。

### 方式 B：本地 build + 上传（备用）

```powershell
powershell -File scripts/deploy/package.ps1
```

构建 → 打包 → SCP → 服务器 `apply.sh` → **preflight** → `pm2 reload`

### 方式 C：仅上传包 + 服务器部署

```powershell
scp deploy.tar.gz ubuntu@159.75.106.21:/home/ubuntu/
ssh ubuntu@159.75.106.21 "cd /home/ubuntu/grainscript && bash scripts/deploy/apply.sh"
```

### 方式 D：服务器 git pull + build（不推荐，慢）

```bash
ssh ubuntu@159.75.106.21
cd /home/ubuntu/grainscript
bash scripts/deploy/pm2-up.sh
```

---

## 服务器生产 `.env`（只维护这一份）

部署包**不会覆盖**服务器上的 `.env`。请 SSH 到 `APP_DIR` 单独编辑，**不要**从本机整文件复制（易带上 `file:./prisma/dev.db` 或 `@db:`）。

```bash
# /home/ubuntu/grainscript/.env

# 数据库 — PM2 在宿主机运行，必须用 127.0.0.1，不能用 docker 服务名 db
DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@127.0.0.1:5432/grainscript

JWT_SECRET=<随机长串，勿用模板>
DEEPSEEK_API_KEY=sk-<真实 Key>

# 可选：Verifier 独立模型
# ZHIPU_API_KEY=

# 文献 PDF — 建议绝对路径，避免 cwd 歧义
RAG_ARTICLES_DIR=/home/ubuntu/grainscript/papers

PYTHON_CMD=python3

# 可选：RAG 向量（不配则仅 BM25）
# RAG_EMBEDDINGS_URL=https://open.bigmodel.cn/api/paas/v4/embeddings
# RAG_EMBEDDING_MODEL=embedding-3
# RAG_EMBEDDING_API_KEY=<智谱 Key>
```

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 必须 `postgresql://...@127.0.0.1:5432/...`（非 `db:`、非 SQLite） |
| `JWT_SECRET` | 随机长字符串 |
| `DEEPSEEK_API_KEY` | 扩写必填 |
| `RAG_ARTICLES_DIR` | PDF 根目录，推荐绝对路径 |
| `ZHIPU_API_KEY` | 可选；Verifier 用 |

### 多 API Key（可选）

用于在 **DeepSeek/智谱按 Key 限流（429）** 时分摊请求；`src/lib/ai.ts` 每次 `callAI` 轮转变量。

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | 主 Key（必填） |
| `DEEPSEEK_API_KEY_2` … `_10` | 额外 DeepSeek Key，写入 `.env` 后 `pm2 reload --update-env` |
| `ZHIPU_API_KEY_2` … `_10` | 可选，Verifier 阶段 |

```bash
# .env 示例
DEEPSEEK_API_KEY=sk-主账号
DEEPSEEK_API_KEY_2=sk-备用1
ZHIPU_API_KEY=...
ZHIPU_API_KEY_2=...
```

也可在 **Admin → 设置** 新增键名 `DEEPSEEK_API_KEY_2`（加密存 DB，约 30 秒热加载）。

**不能替代**：8GB VPS 上同时多条扩写管道的内存压力；多人并发仍建议做写作全局限流（ENG-PR-087）。多 Key ≠ 提高本机并发上限。

`ecosystem.config.cjs` 会把 `.env` 中的 `DEEPSEEK_API_KEY_*`、`ZHIPU_API_KEY_*` 注入 PM2 子进程。

生成 JWT：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 首次 / 索引更新：同步大目录

`package.ps1` **不打进包**（服务器需已存在）：

| 目录 | 用途 |
|------|------|
| `papers/` | PDF 文献 |
| `data/` | RAG 索引 `index_*.json` + `.emb` |

本机示例（按需 rsync/scp）：

```powershell
scp -r papers ubuntu@159.75.106.21:/home/ubuntu/grainscript/
scp -r data    ubuntu@159.75.106.21:/home/ubuntu/grainscript/
```

---

## 部署前自检（preflight）

每次 `apply.sh` / `package.ps1` 在 `pm2 reload` 前会自动执行：

```bash
cd /home/ubuntu/grainscript
bash scripts/deploy/preflight.sh
```

检查项：`.env`、PostgreSQL 连通、`papers`/`data`、API Key、Docker `grainscript-db`。

失败则**不要** reload，按脚本 `FAIL` 提示修复。

部署后深度排查：

```bash
bash scripts/deploy/server-check.sh
pm2 logs grainscript --lines 50
```

---

## PM2 与 `.env`

`ecosystem.config.cjs` 会从项目根读取 `.env` 并注入子进程（`DATABASE_URL`、`DEEPSEEK_API_KEY`、`RAG_ARTICLES_DIR` 等）。

修改 `.env` 后务必：

```bash
pm2 reload ecosystem.config.cjs --update-env
```

---

## 常见故障对照

| 现象 | 原因 | 处理 |
|------|------|------|
| 数据库连不上 | `.env` 用了 `@db:` 或 SQLite | 改为 `127.0.0.1:5432` |
| 扩写 API Key 错误 | 服务器 `.env` 未配或 PM2 未 `--update-env` | 填 Key + reload |
| 429 / 上游限流 | 单 Key 配额用尽 | 增加 `DEEPSEEK_API_KEY_2` 等；仍须控制同时扩写数 |
| 文献库路径不对 | 无 `papers/` 或 `RAG_ARTICLES_DIR` 指错 | scp `papers` 或设绝对路径 |
| RAG 无结果 | 无 `data/index_*.json` | 同步 `data/` 或服务器重建索引 |
| `grainscript-db` 未运行 | Docker 未启动 | `docker start grainscript-db` |

---

## GitHub Secrets（CI/CD）

| Secret | 值 |
|--------|-----|
| `DEPLOY_HOST` | `159.75.106.21` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_PATH` | `/home/ubuntu/grainscript` |
| `DEPLOY_SSH_KEY` | 已配置 |

---

## 部署包内容

`package.ps1` 包含：

- `.next/standalone/*` + `.next/static`
- `ecosystem.config.cjs`、`package.json`、`prisma/`
- `scripts/deploy/`（`apply.sh`、`preflight.sh`、`server-check.sh` 等）

**排除（服务器保留）：**

- `papers/`、`data/`、`node_modules/`、`.env`

## Prisma 跨平台

`schema.prisma` 含 `binaryTargets = ["native", "debian-openssl-3.0.x"]`。服务器 `apply.sh` 会执行 `prisma generate` + `db push`。
