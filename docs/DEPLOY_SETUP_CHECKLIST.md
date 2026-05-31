# 自动部署配置清单（PM2 版）

> 总规范：[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)

**当前方案**：VPS 上 **PM2 + next start**，不用 Docker 跑应用。数据库用本机 PostgreSQL（127.0.0.1:5432）。

---

## 阶段 1：GitHub Secrets（已完成）

| Secret | 状态 |
|--------|------|
| `DEPLOY_HOST` | ✅ `159.75.106.21` |
| `DEPLOY_USER` | ✅ `ubuntu` |
| `DEPLOY_PATH` | ✅ `/opt/grainscript` |
| `DEPLOY_SSH_KEY` | ✅ |

---

## 阶段 2：发布分支

日常开发在 **`cursor/code-quality-cleanup`**，push 该分支即触发 Actions 部署。

```powershell
git checkout cursor/code-quality-cleanup
git push origin cursor/code-quality-cleanup
```

---

## 阶段 3：VPS 手动部署（Actions 挂了时）

```bash
cd /opt/grainscript
export DEPLOY_BRANCH=cursor/code-quality-cleanup
bash scripts/deploy/pm2-up.sh
```

---

## 阶段 4：VPS `.env` 必填

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 首次部署脚本会自动从 SQLite 改为 `postgresql://grainscript:...@127.0.0.1:5432/grainscript` |
| `JWT_SECRET` | 随机长字符串 |
| `DEEPSEEK_API_KEY` | DeepSeek Key |

---

## 本地开发

```powershell
git checkout cursor/code-quality-cleanup
npm run dev
```

本地仍可用 SQLite（`.env` 默认 `file:./prisma/dev.db`）。
