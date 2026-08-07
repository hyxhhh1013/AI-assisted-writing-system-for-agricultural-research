# 部署指南

## 部署方式总览

| 方式 | 适用场景 | 文档 |
|------|---------|------|
| **本地开发** | 本机 PostgreSQL + `npm run dev` | [README](../README.md) 快速开始 |
| **PM2 + SCP 上传** | VPS 生产环境（主站 **ai4science.hyxhhh.site**；另有 aifascience.site 同反代） | 见下方 § PM2 部署 |
| **Git push 自动部署** | 推荐日常：`git push origin main` | 见 `.github/workflows/deploy.yml` |
| **GitHub Actions 手动** | 紧急重发、不 push 时 | Actions → Deploy to VPS (PM2) |

配置清单见 [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)。

> 本地 Docker Compose / `Dockerfile` 已移除；开发请用本机 PostgreSQL（默认端口 `5433`）。

---

## PM2 部署（VPS 生产环境）

### 日常发布（推荐）

合并到 `main` 并推送后，GitHub Actions 会自动：

1. 在云端 `npm run build` + 打 `deploy.tar.gz`（`scripts/deploy/package.sh`）
2. SCP 到 VPS `/home/ubuntu/deploy.tar.gz`
3. SSH 执行 `scripts/deploy/apply.sh` → preflight → `pm2 reload`

```bash
git checkout main
git merge your-feature-branch
git push origin main
```

在仓库 **Actions → Deploy to VPS (PM2)** 查看进度。也可 **Run workflow** 手动重发（不 push 时）。

**前提**：仓库 Secrets 已配置 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`（可选 `DEPLOY_PATH`、`DEPLOY_PORT`）。清单见 [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)。

### 本地打包（备用 / 无 GitHub 时）

```powershell
# 一键完成：build → 打包 → 上传 → 服务器重启
powershell -File scripts/deploy/package.ps1
```

Linux / CI 等价脚本：`bash scripts/deploy/package.sh`（仅产出 tar，不上传）。

### 部署包结构

Next.js standalone 模式：本地 `npm run build` → `.next/standalone/` 包含运行时所需文件。打包脚本（`package.sh` / `package.ps1`）会：

1. 取出 standalone 输出
2. 排除服务器已有的目录（`papers/`, `node_modules/`, `data/`）
3. 补上 `.next/static/`（不在 standalone 内，需单独复制）
4. 压缩为 `deploy.tar.gz`
5. （本地 `package.ps1` 或 CI）SCP 上传 + `apply.sh`

### 手动分步（无 CI 时）

```powershell
# 1. 构建
npm run build

# 2. 打包
# （参考 package.ps1 中的步骤，或直接跑脚本跳过上传）

# 3. 上传
scp deploy.tar.gz ubuntu@159.75.106.21:/home/ubuntu/

# 4. 服务器部署
ssh ubuntu@159.75.106.21 "cd /home/ubuntu/grainscript && bash scripts/deploy/apply.sh"
```

### 服务器脚本

| 脚本 | 用途 |
|------|------|
| `scripts/deploy/apply.sh` | 解压 + npm install + prisma + **preflight** + pm2 reload |
| `scripts/deploy/package.sh` | CI / Linux 本地：build + 打 `deploy.tar.gz` |
| `scripts/deploy/pm2-up.sh` | 服务器 git pull + build（备用，非 push 自动部署） |
| `ecosystem.config.cjs` | PM2 配置（**1 实例 fork**，非 cluster；从 `.env` 注入变量） |
| `scripts/deploy/preflight.sh` | 部署前自检（DB / papers / data / API Key） |
| `scripts/backup.sh` | 生产备份（部署到 `/home/ubuntu/backups/backup.sh`） |

### 生产备份（VPS cron）

策略（避免每日打包 7G 文献）：

| 类型 | 内容 | 频率 | 保留 |
|------|------|------|------|
| 日备 | `.env` + `database.sql.gz` | 每天 03:00 | 14 天 |
| 周备 | `papers/` tar.gz | 周日 | 最近 3 份 |

```bash
# 安装 / 更新脚本后
scp scripts/backup.sh ubuntu@159.75.106.21:/home/ubuntu/backups/backup.sh
ssh ubuntu@159.75.106.21 "chmod +x /home/ubuntu/backups/backup.sh"

# cron（已有可跳过）
# 0 3 * * * bash /home/ubuntu/backups/backup.sh >> /home/ubuntu/backups/backup.log 2>&1

# 紧急补做文献周备
ssh ubuntu@159.75.106.21 "FORCE_PAPERS=1 bash /home/ubuntu/backups/backup.sh"
```

### 常用排查

```bash
# 查看日志
ssh ubuntu@159.75.106.21 "pm2 logs grainscript --lines 30"

# 查看状态
ssh ubuntu@159.75.106.21 "pm2 status"

# 手动重启
ssh ubuntu@159.75.106.21 "pm2 reload ecosystem.config.cjs --update-env"

# 检查 DB
ssh ubuntu@159.75.106.21 "docker ps --filter name=grainscript-db"
```

---

## 本地运行（实验室电脑）

本地 Docker Compose / `Dockerfile` 已移除。请使用本机 PostgreSQL + `npm run dev`，步骤见 [README 快速开始](../README.md)。

默认数据库连接：

```env
DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@localhost:5433/grainscript
```

## 数据持久化

本地 / 宿主机需保留的关键目录：

| 数据 | 路径 |
|------|------|
| 知识库 PDF 索引 | `./data/` |
| 数据库 | 本机 PostgreSQL（非文件库） |
| 生成图表图片 | `./public/charts/` |

## 部署安全检查

- 生产环境 **不要** 设置 `AUTH_BYPASS=true`（`src/proxy.ts` 会在 `NODE_ENV=production` 时忽略该变量）
- `JWT_SECRET` 必须使用随机长字符串，勿用模板默认值

## RAG 索引迁移（约 1.88GB 旧格式）

若 `data/index_*.json` 仍含内嵌 `embedding` 数组（单文件数百 MB），部署新代码前在宿主机执行一次：

```bash
# 预览
npm run rag:convert-index:dry

# 转换（原文件备份到 data/.backup/）
npm run rag:convert-index
```

转换后每个分类应有 `data/index_<分类>.json`（仅 content + metadata）与 `data/index_<分类>.emb`（float32 向量）。新索引请直接用 `npm run index-docs`（已输出分离格式）。

部署后重启应用（PM2 reload），再验证文献对话与语义检索。

## 功能验证清单

部署后建议按顺序验证：

1. 打开 `http://localhost:3000`
2. 文献库列表可加载
3. 语义搜索返回结果
4. 「基于文献对话」可流式回复（非 HTTP 000）
5. 创建或打开项目，运行一次 AI 写作
6. 生成一个普通数据图表
7. 生成一个三线表
8. 导出 PDF
9. 如需使用 XRD/XPS/分子图，再分别验证对应页面

## 常见问题

**Q: 端口 3000 被占用？**
换端口启动：`npx next dev -p 3001`，或结束占用进程后重试。

**Q: 本地连不上数据库？**
确认本机 PostgreSQL 服务在跑，且 `.env` 的 `DATABASE_URL` 端口与 `postgresql.conf` 一致（本仓库默认 `5433`，不是 Docker 的 `5432`）。

**Q: VPS 多人同时扩写卡顿或 PM2 频繁重启？**

8GB 单机建议：

| 项 | 建议 |
|----|------|
| PM2 | **单实例 fork**（`ecosystem.config.cjs` 已配置 `instances: 1`）；勿开 cluster，避免双份 RAG 热数据 |
| 内存 | `max_memory_restart: 4000M`，`--max-old-space-size=3072`；预留 ~2GB 给 PostgreSQL + OS |
| RAG | 默认 `RAG_WARMUP=light` + 全库流式分类检索，避免启动即占满堆 |
| 扩写并发 | `.env` 设置 `WRITING_MAX_CONCURRENT`（代码默认 2；实验室生产 2026-08-07 起调为 3）；并发写满时排队等待（`WRITING_QUEUE_WAIT_MS` 默认 60s），超时才返回友好「繁忙」提示 |
| 默认模式 | `WRITING_DEFAULT_MODE=fast`；UI 默认「快速预览」，深度核查需用户确认 |
| Verifier | `WRITING_VERIFIER_MAX_FULL_SOURCES=5`；高负载自动降为 2；设为 `0` 可跳过全文加载 |

压测：2 个客户端同时「深度核查」扩写时，用 `pm2 monit` 观察内存应稳定、无连续 restart。

**Q: 图表接口报 Python 找不到？**
确认 `.env` 中 `PYTHON_CMD`（Windows 常用 `python`），并在终端执行 `python --version` / `python3 --version`。

**Q: PDF 导出失败？**
先执行 `npx playwright install chromium`，再查看 `npm run dev` / PM2 日志。
