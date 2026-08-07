# 腾讯云 VPS 自动部署（GitHub Actions + VPS 本地构建）

> **开发 / 提交 / 部署总规范**：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)  
> **当前进度清单**（Secrets、还缺什么）：[DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)

推送到 `main` 分支后，GitHub Actions **SSH 登录 VPS**，执行 `git pull` + **本地 Docker build**，**不依赖任何付费镜像仓库**（TCR / GHCR 都不需要）。

## 架构

```text
git push (main)
  → GitHub Actions SSH 到 VPS
  → git pull + docker compose build + up -d
```

日常你只需：`git push`。首次构建约 **15～30 分钟**（VPS 上编译 Next.js + Playwright），后续有 Docker 层缓存会快很多。

**代价**：部署时占用 VPS CPU/内存；小规格机器可能较慢，但 **零额外费用**。

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

建议 VPS 至少 **2 核 4GB**；内存不足时 build 可能 OOM，可临时加 swap。

### 2. 创建部署目录

```bash
sudo mkdir -p /opt/grainscript
sudo chown "$USER:$USER" /opt/grainscript
cd /opt/grainscript
git clone git@github.com:hyxhhh1013/AI-assisted-writing-system-for-agricultural-research.git .
chmod +x scripts/deploy/vps-up.sh
```

（VPS 需已配置 Deploy Key，见 [DEPLOY_SETUP_CHECKLIST.md](./DEPLOY_SETUP_CHECKLIST.md)。）

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

### 4. 首次启动（本地 build）

```bash
cd /opt/grainscript
bash scripts/deploy/vps-up.sh
```

浏览器访问：`http://你的公网IP:3000`

安全组需放行 **3000**（或前面加 Nginx 反代 80/443）。

### 5. 给 GitHub Actions 配 SSH 密钥

**在你自己的电脑上**（Windows PowerShell）：

```powershell
gh secret set DEPLOY_SSH_KEY < E:\Edownload\cursor.pem
```

- 对应公钥需在 VPS 的 `~/.ssh/authorized_keys`
- **不要用密码登录写进 GitHub**；只用密钥

测试：

```powershell
ssh -i E:\Edownload\cursor.pem ubuntu@你的公网IP
```

---

## 二、GitHub Secrets 配置

仓库 → **Settings → Secrets and variables → Actions**

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `DEPLOY_HOST` | VPS 公网 IP | `159.75.106.21` |
| `DEPLOY_USER` | SSH 用户名 | `ubuntu` |
| `DEPLOY_SSH_KEY` | 私钥全文 | `cursor.pem` 文件内容 |
| `DEPLOY_PATH` | 可选，部署目录 | `/opt/grainscript` |
| `DEPLOY_PORT` | 可选，SSH 端口 | `22` |

**不需要** TCR、GHCR、Docker Hub 等任何镜像仓库 Token。

---

## 三、日常发布

```bash
git checkout main
git merge 你的功能分支
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

**Q: Actions 超时？**  
首次 build 较慢，workflow 已设 **45 分钟**。若仍超时，在 VPS 上先手动跑一遍 `bash scripts/deploy/vps-up.sh` 完成首次构建。

**Q: VPS build 内存不足（Killed）？**  
加 swap 或升配；临时：`sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

**Q: deploy 步骤 SSH 连不上？**  
检查安全组是否放行 22、公网 IP 是否正确、`authorized_keys` 是否包含对应公钥。

**Q: 3000 端口被旧进程占用？**  
`vps-up.sh` 会自动尝试释放非 Docker 占用的 3000 端口。

**Q: 还想用云端 build + 拉镜像？**  
需要镜像仓库（GHCR 免费但国内 pull 慢；TCR 国内快但可能收费）。当前方案刻意 **零仓库费用**。

**Q: 本地实验室 Docker 部署？**  
仍见 [DEPLOY.md](./DEPLOY.md)（`docker compose up -d --build`）。

---

## 七、安全提醒

- 不要把 VPS 密码、API Key 写进仓库或聊天记录
- 生产环境关闭 `AUTH_BYPASS`
- 建议用 Nginx + HTTPS 反代，不要长期裸奔 3000 端口
