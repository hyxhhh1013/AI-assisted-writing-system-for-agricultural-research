# 自动部署配置清单

> 总规范：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)  
> 详细步骤：[DEPLOY_VPS.md](./DEPLOY_VPS.md)

按顺序打勾，全部完成即可 `git push main` 自动上线。

---

## 阶段 0：代码进 main（否则 Actions 不存在）

部署相关文件目前在本地，**必须先 merge 到 `main`**：

- [ ] `.github/workflows/deploy.yml`
- [ ] `docker-compose.prod.yml`
- [ ] `scripts/deploy/bootstrap-vps.sh`
- [ ] `scripts/deploy/vps-up.sh`
- [ ] `docs/DEPLOY_VPS.md`、`docs/DEPLOY_SETUP_CHECKLIST.md`、`docs/DEVELOPMENT_WORKFLOW.md`

可对 AI 说：「帮我把部署相关文件单独 commit 并开 PR 合到 main」。

---

## 阶段 1：GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions**

| Secret | 状态 | 说明 |
|--------|------|------|
| `DEPLOY_HOST` | ✅ 已配置 | `159.75.106.21` |
| `DEPLOY_USER` | ✅ 已配置 | `ubuntu` |
| `DEPLOY_PATH` | ✅ 已配置 | `/opt/grainscript` |
| `DEPLOY_SSH_KEY` | ⬜ **待你配置** | SSH **私钥**全文（见下） |
| `GHCR_PULL_TOKEN` | ⬜ **待你配置** | PAT，`read:packages`（见下） |
| `DEPLOY_PORT` | 可选 | 默认 22 |

### 1.1 配置 DEPLOY_SSH_KEY

你曾提供的是**公钥**；Actions 需要配对的**私钥**（`.pem` 文件）。

```powershell
# 路径改成你本机实际的 .pem
gh secret set DEPLOY_SSH_KEY < C:\Users\你的用户名\Downloads\skey-qxuyis6t.pem
```

验证能否登录：

```powershell
ssh -i C:\path\to\your-key.pem ubuntu@159.75.106.21
```

私钥丢了 → 腾讯云重新绑定密钥，或按 DEPLOY_VPS.md 新建 `deploy_key` 对。

### 1.2 配置 GHCR_PULL_TOKEN

1. 打开 https://github.com/settings/tokens?type=beta  
2. Generate token → 权限 **read:packages**  
3. 执行：

```powershell
gh secret set GHCR_PULL_TOKEN
# 粘贴 token 回车
```

**简化选项**：首次构建成功后，把 `ghcr.io` 上的 `grainscript` 包设为 **Public**，VPS 可不登录拉镜像（仍建议保留 Token）。

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
- [ ] 阶段 1 两个 Secret 已填
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
| 本机 `.pem` 私钥 → `gh secret set DEPLOY_SSH_KEY` | 私钥文件内容 |
| GitHub PAT → `gh secret set GHCR_PULL_TOKEN` | Token 全文 |
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
