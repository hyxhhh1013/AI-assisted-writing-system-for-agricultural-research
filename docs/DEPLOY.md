# 部署指南（唯一方案）

> **本文件是 GrainScript 生产部署的唯一权威文档。**
> 部署方法只有一种：**本地 build → 打包 → scp 上传 → 服务器 `apply.sh`（nohup 分离跑）→ 轮询日志**。
>
> 已废弃的替代方案（**不要再用**）：
> - ~~`git push` 自动部署~~：`.github/workflows/deploy.yml` 为 `workflow_dispatch` **手动触发**，不会 push 自动跑；且本地 scp 已覆盖其能力。
> - ~~Docker VPS 构建~~：`DEPLOY_VPS.md` 已移入 `docs/archive/`（本地 Docker Compose / Dockerfile 均已移除）。
> - ~~服务器 `git pull` + build~~：`pm2-up.sh`（慢、不可控，仅历史备用）。

---

## 一、服务器信息

| 项 | 值 |
|----|-----|
| 服务器 IP | `159.75.106.21` |
| SSH 用户 / 免密 | `ubuntu` / `E:\Edownload\cursor.pem` |
| 应用目录 | `/home/ubuntu/grainscript/` |
| 进程管理 | PM2 `grainscript`（**1 实例 fork**，`ecosystem.config.cjs`） |
| 数据库 | PostgreSQL Docker `grainscript-db`，映射 `127.0.0.1:5432` |
| 域名 | **ai4science.hyxhhh.site**（主站，Nginx → localhost:3000） |
| 运行方式 | `node server.js`（standalone）——**不要用 `next start`** |
| GitHub | `hyxhhh1013/AI-assisted-writing-system-for-agricultural-research` |

---

## 二、部署前置

1. **本地 `.env` 已含 Agent 构建开关**（`NEXT_PUBLIC_*` 在 build 时注入；`AGENT_*` 运行时读服务器 `.env`）：

   ```env
   AGENT_ENABLED=1
   NEXT_PUBLIC_AGENT_ENABLED=1
   AGENT_WRITE_ENABLED=1
   NEXT_PUBLIC_AGENT_WRITE_ENABLED=1
   AGENT_WRITE_AUTO_FIX=1
   ```

2. **服务器 `.env` 永远不被部署包覆盖**（`apply.sh` 用 `--exclude='.env'`）。只维护服务器那一份，见 §五。
3. SSH 可用 `ssh -i E:\Edownload\cursor.pem ubuntu@159.75.106.21` 免密。

---

## 三、部署步骤（唯一流程）

### 0. 提交

```bash
git add <改动>
git commit -m "feat(scope): ..."
```

按 `AGENTS.md` 铁律：功能/修复与对应 `docs/` 改动**同一个 commit**。

### 1. 构建（本地）

```bash
npm run build   # → .next/standalone/（Next.js standalone）
```

> Turbopack 打包约 1–3 分钟。产出 `.next/BUILD_ID` 记下，部署后核对。

### 2. 打包

推荐直接用 `package.sh`（已用 `tar` 管道**排除 node_modules**，避免复制 692M 卡死）：

```bash
bash scripts/deploy/package.sh
```

**打包后必须验证**（防「漏掉 `.next`」事故）：

```bash
tar -tzf deploy.tar.gz | grep -c "\.next/BUILD_ID"   # 必须非 0
```

部署包内容：`.next/standalone/.*`（含隐藏 `.next`）+ `.next/static` + `ecosystem.config.cjs` + `package.json` + `prisma/` + `scripts/deploy/` + `scripts/index-pdfs.mjs` 及 `scripts/lib`、`scripts/extractors`（知识库索引 spawn，不进 standalone trace）。**排除**：`node_modules/`、`papers/`、`data/`、`.env`、`package-lock.json`。

### 3. 上传（scp，单次连接）

```bash
scp -i "E:/Edownload/cursor.pem" -o StrictHostKeyChecking=no deploy.tar.gz ubuntu@159.75.106.21:/home/ubuntu/deploy.tar.gz
```

### 4. 服务器部署（nohup 分离跑）

**不要**用长 SSH 会话直接跑 `apply.sh`（会被 fail2ban 限流）。用短连接只负责启动：

```bash
ssh -i "E:/Edownload/cursor.pem" -o StrictHostKeyChecking=no ubuntu@159.75.106.21 \
  "cd /home/ubuntu/grainscript && nohup bash scripts/deploy/apply.sh > /tmp/grainscript-deploy.log 2>&1 & echo LAUNCHED"
```

`apply.sh` 服务器端自动完成：解压（不覆盖 `.env`）→ `npm install --production` → `prisma generate` → `prisma db push` → **Turbopack Prisma hash 符号链接** → `preflight` 自检 → `pm2 reload` → HTTP 检查。

### 5. 轮询日志

```bash
ssh -i "E:/Edownload/cursor.pem" -o StrictHostKeyChecking=no ubuntu@159.75.106.21 \
  "tail -30 /tmp/grainscript-deploy.log"
```

期望顺序：`...PREFLIGHT PASSED → PM2 零停机重启 → HTTP 检查`。

### 6. 部署后验证

- `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000` → `200`
- `pm2 status` → `grainscript online`
- **确认新构建已上线**：`cat .next/BUILD_ID` 与本地一致；`grep -rl <新功能字符串> .next/server/chunks/` 命中
- 首页 `/`、`/login` 200；未认证 API 401（正常）
- 按 §十 功能清单抽查

### 6b. 外部摘要补建（按需）

`data/` / `papers/` **不进部署包**。若线上已有「只入库未索引」的外部摘要，部署后在服务器执行：

```bash
cd /home/ubuntu/grainscript
set -a && . ./.env && set +a
node scripts/rebuild-external-abstracts.cjs --all
pm2 reload grainscript
```

或 Admin：`POST /api/admin/knowledge/rebuild-external-abstracts`，body `{ "all": true }`。

---

## 四、踩坑清单（部署前必读）

| # | 坑 | 现象 | 规避 |
|---|----|------|------|
| 1 | **bash glob `*` 不匹配隐藏目录** | 打包漏掉 `.next`（点开头），服务器 `server.js` 报 `Could not find a production build in './.next'` → 生产宕机 | 用 `package.sh`（内部 `cp -a .next/standalone/. deploy-pkg/`，`/.` 含隐藏项）；或手动 `cp -a .next/standalone/.` |
| 2 | **`.next/static` 不在 standalone 内** | 静态资源 404 | `package.sh` 已单独 `cp -a .next/static deploy-pkg/.next/static`（standalone 已含时幂等） |
| 3 | **standalone 含 692M node_modules** | 复制 + 打包超时（本机 2 分钟卡死） | `package.sh` 用 `tar -C .next/standalone --exclude=node_modules --exclude=papers --exclude=data -cf - . \| tar -C deploy-pkg -xf -` 排除 |
| 4 | **SSH 限流（fail2ban）** | `Connection closed by ... port 22`，持续几分钟 | **别硬连/别重试**（每次失败重置计时）；等 ~10 分钟一次性干净上传；部署用 nohup 分离，短连接只负责启动 |
| 5 | **`pm2 reload` 吃旧 `.env`** | 改服务器 `.env`（如 `WRITING_MAX_CONCURRENT`）后 reload 不生效 | 改 env 必须 `pm2 delete grainscript && pm2 start ecosystem.config.cjs && pm2 save`；纯代码部署（无 env 变更）用 `apply.sh` 的 reload 即可 |
| 6 | **Turbopack hashed external 断裂** | HTTP 500；日志 `Cannot find module '@prisma/client-<hash>'` 或 `@napi-rs/canvas-<hash>`（Agent/附件 PDF 常见） | `serverExternalPackages` 被 Turbopack 改写成带 hash 的模块名。**`link-hashed-externals.sh`** 扫描并链接；`apply.sh` 解压后 **exec 新脚本**再跑链接（避免 nohup 仍执行旧 apply、只链 prisma） |
| 6b | **nohup 跑旧 apply.sh** | 部署日志只出现 prisma 链接、Agent 仍 500缺 canvas | bash 不会热更新已打开的脚本；`apply.sh` Phase1 解压后 `exec` 新包内脚本 |
| 7 | **用 `next start` 跑 standalone** | 报错 / 不工作 | 必须 `node server.js`（standalone 模式不支持 `next start`） |
| 8 | **`.env` 被打进部署包** | 覆盖服务器生产配置（DATABASE_URL 变 SQLite/`@db:`） | 打包排除 `.env`；`apply.sh` `--exclude='.env'` |
| 9 | **未验证 BUILD_ID** | 自以为部署成功，实际旧包/漏包 | 部署后 `cat .next/BUILD_ID` 与本地核对；打包后 `tar -tzf deploy.tar.gz \| grep -c '\.next/BUILD_ID'` |
| 10 | **`WRITING_MAX_CONCURRENT` 调优不生效** | 并发仍是旧值 | 同 #5：`pm2 delete + start` 才吃新 env |

---

## 五、服务器 `.env` 配置（只维护这一份）

`apply.sh` 不覆盖 `.env`。SSH 到 `/home/ubuntu/grainscript/.env` 编辑，**不要**从本机整文件复制（易带上 `file:./prisma/dev.db` 或 `@db:`）。

```env
# 数据库 — PM2 在宿主机运行，必须 127.0.0.1，不能用 docker 服务名 db
DATABASE_URL=postgresql://grainscript:grainscript_dev_2024@127.0.0.1:5432/grainscript

JWT_SECRET=<随机长串，勿用模板>
DEEPSEEK_API_KEY=sk-<真实 Key>

# 文献 PDF — 建议绝对路径
RAG_ARTICLES_DIR=/home/ubuntu/grainscript/papers

PYTHON_CMD=python3

# 可选：写作并发（2026-08-07 生产调为 3）
# WRITING_MAX_CONCURRENT=3
# WRITING_DEFAULT_MODE=fast
# AGENT_WRITE_AUTO_FIX=1
```

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 必须 `postgresql://...@127.0.0.1:5432/...`（非 `db:`、非 SQLite） |
| `JWT_SECRET` | 随机长串，生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DEEPSEEK_API_KEY` | 扩写必填；可配 `_2`…`_10` 多 Key 轮转（429 限流时分摊） |
| `RAG_ARTICLES_DIR` | PDF 根目录绝对路径 |
| `WRITING_MAX_CONCURRENT` | 扩写并发（默认 2；生产 3）。**改后必须 `pm2 delete + start`** |

`ecosystem.config.cjs` 会把 `.env` 的 `DEEPSEEK_API_KEY_*`、`ZHIPU_API_KEY_*` 注入 PM2 子进程。

---

## 六、常见故障对照

| 现象 | 原因 | 处理 |
|------|------|------|
| HTTP 500 + `Cannot find module '@prisma/client-<hash>'` / `@napi-rs/canvas-<hash>` | Turbopack hashed external 缺失 | 检查 `apply.sh` 链接步骤；手动：`ln -sfn ../.prisma/client node_modules/@prisma/client-<hash>`；`ln -sfn canvas node_modules/@napi-rs/canvas-<hash>` + `pm2 reload` |
| `Could not find a production build in './.next'` | 打包漏 `.next`（glob 坑 #1） | 重打包（`package.sh`），验证 BUILD_ID |
| 数据库连不上 | `.env` 用了 `@db:` / SQLite | 改 `127.0.0.1:5432` |
| 扩写 API Key 错误 | 服务器 `.env` 未配 / PM2 未吃新 env | 填 Key + `pm2 delete + start` |
| `grainscript-db` 未运行 | Docker 未启动 | `docker start grainscript-db` |
| RAG 无结果 | 无 `data/index_*.json` | 同步 `data/` 或服务器重建索引 |
| 文献库路径不对 | 无 `papers/` 或 `RAG_ARTICLES_DIR` 指错 | 同步 `papers` 或设绝对路径 |

---

## 七、生产备份（VPS cron）

策略（避免每日打包 7G 文献）：

| 类型 | 内容 | 频率 | 保留 |
|------|------|------|------|
| 日备 | `.env` + `database.sql.gz` | 每天 03:00 | 14 天 |
| 周备 | `papers/` tar.gz | 周日 | 最近 3 份 |

```bash
scp scripts/backup.sh ubuntu@159.75.106.21:/home/ubuntu/backups/backup.sh
ssh ubuntu@159.75.106.21 "chmod +x /home/ubuntu/backups/backup.sh"
# cron（已有可跳过）：0 3 * * * bash /home/ubuntu/backups/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
```

---

## 八、RAG 索引迁移

若 `data/index_*.json` 仍含内嵌 `embedding`（单文件数百 MB），部署新代码前在宿主机执行一次：

```bash
npm run rag:convert-index:dry   # 预览
npm run rag:convert-index       # 转换（原文件备份到 data/.backup/）
```

转换后应有 `data/index_<分类>.json`（content + metadata）与 `data/index_<分类>.emb`（float32）。部署后 PM2 重启，验证语义检索。

---

## 九、部署安全检查

- 生产**不要**设 `AUTH_BYPASS=true`（`src/proxy.ts` 在 `NODE_ENV=production` 时忽略）
- `JWT_SECRET` 必须随机长串
- 服务器密码 / API Key 勿写进仓库或聊天记录
- Nginx 已配 HTTPS 反代 ai4science.hyxhhh.site → localhost:3000

---

## 十、功能验证清单（部署后）

1. 打开 `ai4science.hyxhhh.site`，登录可用
2. 文献库列表可加载、语义搜索返回结果
3. 「基于文献对话」可流式回复（非 HTTP 000）
4. 创建/打开项目，Agent 一次扩写成功
5. Agent「收集文献」→ 确认卡列出全部候选并可勾选批量导入（W3-AP-LIT-BATCH）
6. 生成普通数据图表 + 三线表
7. 导出 PDF / DOCX
8. XRD/XPS/分子图按需抽查
