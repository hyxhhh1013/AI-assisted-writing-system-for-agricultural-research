# 自动部署配置清单

> 总规范：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)  
> 详细步骤：[DEPLOY_VPS.md](./DEPLOY_VPS.md)

按顺序打勾，全部完成即可 `git push main` 自动上线。

**当前方案**：VPS **本地 Docker build**，零镜像仓库费用（不用 TCR / GHCR）。

---

## 阶段 0：代码进 main

部署相关文件已在 `main`：

- [x] `.github/workflows/deploy.yml`（SSH 触发 VPS build）
- [x] `docker-compose.prod.yml`（含 `build: .`）
- [x] `scripts/deploy/bootstrap-vps.sh`
- [x] `scripts/deploy/vps-up.sh`
- [x] 部署文档

---

## 阶段 1：GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions**

| Secret | 状态 | 说明 |
|--------|------|------|
| `DEPLOY_HOST` | ✅ 已配置 | `159.75.106.21` |
| `DEPLOY_USER` | ✅ 已配置 | `ubuntu` |
| `DEPLOY_PATH` | ✅ 已配置 | `/opt/grainscript` |
| `DEPLOY_SSH_KEY` | ✅ 已配置 | `cursor.pem` 私钥 |
| `DEPLOY_PORT` | 可选 | 默认 22 |

**不需要** `TCR_*`、`GHCR_PULL_TOKEN` 等镜像仓库 Secret。

验证 SSH：

```powershell
ssh -i E:\Edownload\cursor.pem ubuntu@159.75.106.21
```

---

## 阶段 2：VPS 一次性初始化

> **GitHub 绑定（已完成）**：VPS 已配置 Deploy Key（`~/.ssh/grainscript_deploy`），可 `git pull` 同步 `main`。

用腾讯云 **网页终端** 或 `ssh -i cursor.pem ubuntu@159.75.106.21` 登录。

### 2.1 安装 Docker + 克隆仓库

```bash
sudo mkdir -p /opt/grainscript
sudo chown ubuntu:ubuntu /opt/grainscript
git clone git@github.com:hyxhhh1013/AI-assisted-writing-system-for-agricultural-research.git /opt/grainscript
cd /opt/grainscript
git checkout main
chmod +x scripts/deploy/vps-up.sh
```

### 2.2 配置 VPS 环境变量

```bash
cd /opt/grainscript
cp .env.example .env
nano .env
```

**必填：**

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | 随机长字符串（不要用模板默认值） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |

可选：`ZHIPU_API_KEY`（Verifier 用）

生成 JWT：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.3 腾讯云安全组

- [ ] 放行 **22**（SSH）
- [ ] 放行 **3000**（HTTP，或后续改 Nginx 80/443）

### 2.4 VPS 规格建议

- [ ] 至少 **2 核 4GB**（本地 build Next.js + Playwright）
- [ ] 若 build 被 Kill，加 **4GB swap**（见 DEPLOY_VPS.md FAQ）

---

## 阶段 3：触发第一次部署

- [x] 阶段 0 完成
- [x] 阶段 1 SSH Secrets 已填
- [ ] 阶段 2 VPS 已 clone + `.env` 已编辑

然后：

```powershell
git push origin main
```

或 GitHub → **Actions** → **Deploy to VPS** → **Run workflow**

- [ ] Actions 中 `deploy` 绿色（首次可能跑 **15～45 分钟**）
- [ ] 浏览器打开 http://159.75.106.21:3000 能访问
- [ ] 注册/登录 + 打开项目冒烟测试

---

## 我还需要你提供什么？

| 你需要做的 | AI **不能**代劳的 |
|------------|-------------------|
| VPS 上 `nano .env` 填 API Key | `DEEPSEEK_API_KEY` |
| VPS 上 `nano .env` 填 JWT | `JWT_SECRET` |
| 腾讯云安全组放行端口 | 控制台操作 |
| 若 build OOM → 加 swap 或升配 | 控制台操作 |

**请勿在聊天里发送：私钥、密码、API Key。**

---

## 安全提醒

- 公钥可公开；**私钥、API Key 绝不进 Git、不进聊天**
- 生产环境 **不要** 设置 `AUTH_BYPASS=true`
- 长期公网建议加 Nginx + HTTPS，不要裸奔 3000 端口
