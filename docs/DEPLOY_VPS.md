# 腾讯云 VPS 自动部署（GitHub Actions + GHCR）

> **开发 / 提交 / 部署总规范**：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)  
> **当前进度清单**（Secrets、还缺什么）：[DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)

推送到 `main` 分支后，GitHub 在云端构建 Docker 镜像并推到 **GHCR**，VPS 只负责 **拉镜像 + 重启**，不在服务器上编译。

## 架构

```text
git push (main)
  → GitHub Actions: docker build + push ghcr.io/OWNER/grainscript:latest
  → SSH 到 VPS: docker compose pull + up -d
```

日常你只需：`git push`，约 5～10 分钟后线上自动更新。

---

## 一、服务器一次性准备（Ubuntu）

以下在 VPS 上执行（将 `YOUR_USER` 换成你的 Linux 用户名，如 `ubuntu`）。

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

### 2. 创建部署目录

```bash
sudo mkdir -p /opt/grainscript
sudo chown "$USER:$USER" /opt/grainscript
cd /opt/grainscript
git clone https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research.git .
chmod +x scripts/deploy/vps-up.sh
```

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

生产环境至少修改：

- `JWT_SECRET` — 随机长字符串（不要用默认值）
- `DEEPSEEK_API_KEY` — 你的 API Key
- `ZHIPU_API_KEY` — 可选

`docker-compose.prod.yml` 会覆盖 `DATABASE_URL` 为 PostgreSQL，无需在 `.env` 里改 SQLite 路径。

### 4. 首次启动（拉镜像）

在 GitHub 第一次成功构建镜像 **之后**：

```bash
cd /opt/grainscript
export GRAINSCRIPT_IMAGE=ghcr.io/hyxhhh1013/grainscript:latest
# 若镜像是私有的，先登录（见下文 GHCR_PULL_TOKEN）
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d
```

浏览器访问：`http://你的公网IP:3000`

安全组需放行 **3000**（或前面加 Nginx 反代 80/443）。

### 5. 给 GitHub Actions 配 SSH 密钥

**在你自己的电脑上**（Windows PowerShell 或 Git Bash）：

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
```

- 把 `deploy_key.pub` 内容追加到 VPS 的 `~/.ssh/authorized_keys`
- 把 `deploy_key`（私钥，整文件含 BEGIN/END）存到 GitHub Secret

测试：

```bash
ssh -i deploy_key YOUR_USER@你的公网IP
```

**不要用密码登录写进 GitHub**；只用密钥。

---

## 二、GitHub Secrets 配置

仓库 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `DEPLOY_HOST` | VPS 公网 IP | `159.75.106.21` |
| `DEPLOY_USER` | SSH 用户名 | `ubuntu` |
| `DEPLOY_SSH_KEY` | 私钥全文 | `deploy_key` 文件内容 |
| `DEPLOY_PATH` | 可选，部署目录 | `/opt/grainscript` |
| `DEPLOY_PORT` | 可选，SSH 端口 | `22` |
| `GHCR_PULL_TOKEN` | 拉私有镜像用 PAT | 见下一节 |

### GHCR_PULL_TOKEN 怎么来

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. 权限：`read:packages`，仓库选本仓库（或 All repositories）
3. 生成后复制 token，存入 `GHCR_PULL_TOKEN`

**简化做法（推荐新手）**：构建成功后，到 **Packages → grainscript → Package settings → Change visibility → Public**，VPS 拉 `latest` 时可不登录。仍建议保留 PAT 以便以后改回私有。

---

## 三、日常发布

```bash
git add .
git commit -m "your message"
git push origin main
```

在 GitHub **Actions** 页查看 `Deploy to VPS` 工作流。成功即已上线。

也可手动触发：**Actions → Deploy to VPS → Run workflow**。

---

## 四、手动紧急部署（Actions 挂了时）

SSH 登录 VPS：

```bash
cd /opt/grainscript
git pull --ff-only origin main
export GRAINSCRIPT_IMAGE=ghcr.io/hyxhhh1013/grainscript:latest
export GHCR_USER=hyxhhh1013
export GHCR_TOKEN=你的PAT
bash scripts/deploy/vps-up.sh
```

---

## 五、数据与备份

以下目录在宿主机，容器更新 **不会** 丢失：

| 数据 | 路径 |
|------|------|
| 知识库索引 | `/opt/grainscript/data/` |
| 图表输出 | `/opt/grainscript/public/charts/` |
| PostgreSQL | Docker volume `pgdata` |

备份 PostgreSQL：

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U grainscript grainscript > backup.sql
```

---

## 六、常见问题

**Q: Actions 构建失败，内存不足？**  
GitHub 免费 runner 一般够用；若失败，重试或检查 Dockerfile 是否被改大。

**Q: deploy 步骤 SSH 连不上？**  
检查安全组是否放行 22、公网 IP 是否正确、`authorized_keys` 是否包含对应公钥。

**Q: pull 镜像 401 Unauthorized？**  
配置 `GHCR_PULL_TOKEN`，或把 GHCR 包改为 Public。

**Q: 还想在服务器上 build？**  
用原来的 `docker-compose.yml` + `docker compose up -d --build`（慢，不推荐）。

**Q: 本地实验室 Docker 部署？**  
仍见 [DEPLOY.md](./DEPLOY.md)（`docker compose up -d --build`）。

---

## 七、安全提醒

- 不要把 VPS 密码、API Key 写进仓库或聊天记录
- 生产环境关闭 `AUTH_BYPASS`
- 建议用 Nginx + HTTPS 反代，不要长期裸奔 3000 端口
