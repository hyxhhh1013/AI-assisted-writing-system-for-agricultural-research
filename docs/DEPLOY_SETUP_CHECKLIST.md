# 部署配置清单

> 主文档：[DEPLOY.md](./DEPLOY.md)

## 当前方案

**VPS 生产环境**：PM2 + Node.js standalone（数据库用 Docker PostgreSQL）

| 项目 | 值 |
|------|-----|
| 服务器 IP | `159.75.106.21` |
| 用户 | `ubuntu` |
| 应用目录 | `/home/ubuntu/grainscript/` |
| 数据库 | PostgreSQL Docker (`grainscript-db`, 端口 5432) |
| 进程管理 | PM2 (`grainscript`, 2 实例 cluster) |
| 域名 | aifascience.site (Nginx → localhost:3000) |
| GitHub | `hyxhhh1013/AI-assisted-writing-system-for-agricultural-research` |

## 部署方式

### 方式 A：本地 build + 上传（日常推荐）

```powershell
# 一键：构建 → 打包 → 上传 → 服务器部署
powershell -File scripts/deploy/package.ps1
```

脚本自动完成：`npm run build` → 打包 standalone + static → SCP → SSH 部署

### 方式 B：仅上传已打包文件 + 服务器部署

```powershell
# 上传
scp deploy.tar.gz ubuntu@159.75.106.21:/home/ubuntu/

# SSH 部署
ssh ubuntu@159.75.106.21 "cd /home/ubuntu/grainscript && bash scripts/deploy/apply.sh"
```

### 方式 C：服务器 git pull + build（CI / 手动）

```bash
ssh ubuntu@159.75.106.21
cd /home/ubuntu/grainscript
bash scripts/deploy/pm2-up.sh
```

## 服务器 .env 必填

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `postgresql://grainscript:grainscript_dev_2024@localhost:5432/grainscript` |
| `JWT_SECRET` | 随机长字符串 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |

## GitHub Secrets（CI/CD 用）

| Secret | 值 |
|--------|-----|
| `DEPLOY_HOST` | `159.75.106.21` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_PATH` | `/home/ubuntu/grainscript` |
| `DEPLOY_SSH_KEY` | 已配置 |

## 部署包内容

打包脚本 (`package.ps1`) 自动处理：

**包含：**
- `.next/` — 编译产出（server + static）
- `prisma/` — schema + migrations
- `public/` — 静态资源
- `server.js` — Next.js standalone 入口
- `ecosystem.config.cjs` — PM2 配置
- `package.json` — 依赖声明

**排除：**
- `papers/` — PDF 知识库（服务器已有）
- `node_modules/` — 服务器 `npm install` 安装
- `data/` — RAG 索引（服务器已有）

## Prisma 跨平台

`schema.prisma` 已配置 `binaryTargets = ["native", "debian-openssl-3.0.x"]`，本地 build 的 Prisma Client 同时包含 Windows + Linux 引擎。服务器端 `apply.sh` 仍会执行 `npx prisma generate` 确保兼容。
