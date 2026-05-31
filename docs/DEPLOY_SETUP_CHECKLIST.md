# 自动部署配置清单

> 总规范：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)  
> 详细步骤：[DEPLOY_VPS.md](./DEPLOY_VPS.md)

按顺序打勾，全部完成即可 `git push main` 自动上线。

---

## 阶段 0：代码进 main（否则 Actions 不存在）

部署相关文件已在 `main`：

- [x] `.github/workflows/deploy.yml`（推 TCR）
- [x] `docker-compose.prod.yml`
- [x] `scripts/deploy/bootstrap-vps.sh`
- [x] `scripts/deploy/vps-up.sh`
- [x] `docs/DEPLOY_VPS.md`、`docs/DEPLOY_SETUP_CHECKLIST.md`、`docs/DEVELOPMENT_WORKFLOW.md`

---

## 阶段 1：GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions**

| Secret | 状态 | 说明 |
|--------|------|------|
| `DEPLOY_HOST` | ✅ 已配置 | `159.75.106.21` |
| `DEPLOY_USER` | ✅ 已配置 | `ubuntu` |
| `DEPLOY_PATH` | ✅ 已配置 | `/opt/grainscript` |
| `DEPLOY_SSH_KEY` | ✅ 已配置 | `cursor.pem` 私钥 |
| `TCR_NAMESPACE` | ⬜ **待你配置** | TCR 命名空间，如 `grainscript` |
| `TCR_USERNAME` | ⬜ **待你配置** | 腾讯云账号 ID（12 位） |
| `TCR_PASSWORD` | ⬜ **待你配置** | TCR 控制台「固定密码」 |
| `TCR_REGISTRY` | 可选 | 默认 `ccr.ccs.tencentyun.com` |
| `DEPLOY_PORT` | 可选 | 默认 22 |

### 1.1 配置 TCR（替代 GHCR，国内拉取更快）

1. 打开 https://console.cloud.tencent.com/tcr → **个人版**
2. **命名空间** → 新建（建议名 `grainscript`，与 `TCR_NAMESPACE` 一致）
3. **访问凭证** → 设置 **固定密码**，记下 **登录用户名**（账号 ID）
4. 在本机执行（把值换成你的）：

```powershell
gh secret set TCR_NAMESPACE -b "grainscript"
gh secret set TCR_USERNAME -b "你的12位账号ID"
gh secret set TCR_PASSWORD -b "你在控制台设置的固定密码"
```

**请勿在聊天里发送 TCR 密码。**

### 1.2 验证 SSH（已完成）

```powershell
ssh -i E:\Edownload\cursor.pem ubuntu@159.75.106.21
```

---

## 阶段 2：VPS 一次性初始化

> **GitHub 绑定（已完成）**：VPS 已配置 Deploy Key（`~/.ssh/grainscript_deploy`），可 `git pull` 同步 `main`。  
> 公钥已登记在仓库 **Settings → Deploy keys**（标题含 `159.75.106.21`）。

用腾讯云 **网页终端** 或 `ssh -i cursor.pem ubuntu@159.75.106.21` 登录。

### 2.1 安装 Docker + 克隆仓库

若 `main` 上已有 bootstrap 脚本：

```bash
export DEPLOY_PUBKEY='你的公钥一行'
curl -fsSL https://raw.githubusercontent.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research/main/scripts/deploy/bootstrap-vps.sh -o /tmp/bootstrap-vps.sh
bash /tmp/bootstrap-vps.sh
```

若 main 尚未 merge，手动：

```bash
sudo mkdir -p /opt/grainscript
sudo chown ubuntu:ubuntu /opt/grainscript
git clone https://github.com/hyxhhh1013/AI-assisted-writing-system-for-agricultural-research.git /opt/grainscript
cd /opt/grainscript
git checkout main
```

### 2.2 写入 deploy 公钥（若 bootstrap 未做）

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '你的公钥一行' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 2.3 配置 VPS 环境变量

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

### 2.4 腾讯云安全组

- [ ] 放行 **22**（SSH）
- [ ] 放行 **3000**（HTTP，或后续改 Nginx 80/443）

---

## 阶段 3：触发第一次部署

- [ ] 阶段 0 完成（deploy workflow 在 `main` 上）
- [ ] 阶段 1 三个 TCR Secret 已填（`TCR_NAMESPACE`、`TCR_USERNAME`、`TCR_PASSWORD`）
- [ ] 阶段 2 VPS 已 clone + `.env` 已编辑

然后：

```powershell
git push origin main
```

或 GitHub → **Actions** → **Deploy to VPS** → **Run workflow**

- [ ] Actions 中 `build-and-push` 绿色  
- [ ] Actions 中 `deploy` 绿色  
- [ ] 浏览器打开 http://159.75.106.21:3000 能访问  
- [ ] 注册/登录 + 打开项目冒烟测试  

---

## 我还需要你提供什么？（给 AI / 给自己）

| 你需要做的 | AI **不能**代劳的 |
|------------|-------------------|
| TCR 控制台开命名空间 + 固定密码 | TCR 密码 |
| `gh secret set TCR_*` 三个 Secret | 账号 ID、密码 |
| VPS 上 `nano .env` 填 API Key | `DEEPSEEK_API_KEY` |
| VPS 上 `nano .env` 填 JWT | `JWT_SECRET` |
| 腾讯云安全组放行端口 | 控制台操作 |
| 若密码曾泄露 → 改 VPS 密码 | 控制台操作 |

**请勿在聊天里发送：私钥、密码、API Key。**

---

## 安全提醒

- 公钥可公开；**私钥、PAT、API Key 绝不进 Git、不进聊天**
- 生产环境 **不要** 设置 `AUTH_BYPASS=true`
- 长期公网建议加 Nginx + HTTPS，不要裸奔 3000 端口
