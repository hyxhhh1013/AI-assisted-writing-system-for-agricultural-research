# 部署指南

## 环境要求

- Docker Desktop（Windows/Mac）或 Docker Engine（Linux）
- 至少 6 GB 空闲内存给 Docker
- 不需要在宿主机安装 Node.js、Python、Playwright 或图表依赖；这些依赖都会打进镜像

## 实验室电脑部署步骤

### 1. 安装 Docker Desktop

从 https://www.docker.com/products/docker-desktop/ 下载安装。
安装后重启电脑。

### 2. 创建 .env 配置

复制模板并填入真实值：

```bash
cp .env.example .env
```

项目根目录的 `.env` 至少需要包含：

```env
DEEPSEEK_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx      # 可选，不配则自动降级为 DeepSeek
JWT_SECRET=你的随机密钥  # 改掉默认值！
DATABASE_URL=file:./prisma/dev.db
PYTHON_CMD=python3
```

生成 JWT_SECRET 示例：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 构建并启动

```bash
cd 论文助手
docker compose up -d --build
```

第一次构建需要较长时间（下载 Playwright 镜像、npm install、Python 依赖安装）。之后启动只需要几秒。

### 4. 访问

浏览器打开：`http://localhost:3000`

实验室其他同学通过这台电脑的 IP 访问：`http://192.168.x.x:3000`

### 5. 查看日志

```bash
docker compose logs -f
```

### 6. 容器内自检

```bash
docker compose exec app node -v
docker compose exec app python3 --version
docker compose exec app python3 -c "import matplotlib, numpy, pandas, scipy; print('python deps ok')"
docker compose exec app python3 -c "import PyXplore; print('pyxplore ok')"
docker compose exec app python3 -c "from rdkit import Chem; print('rdkit ok')"
docker compose exec app python3 -c "import graphviz; print('graphviz ok')"
```

如果 RDKit 检查失败，只会影响分子结构图。如果 PyXplore 检查失败，会影响 XRD/XPS 相关功能；AI 写作、普通图表、三线表和 PDF 导出仍可继续验证。

### 7. 更新代码后重新部署

```bash
git pull
docker compose up -d --build
```

### 8. 停止

```bash
docker compose down
```

## 数据持久化

以下数据保存在宿主机上，容器删除不会丢失：

| 数据 | 路径 |
|------|------|
| 知识库 PDF 索引 | `./data/` |
| 数据库（用户、项目、论文） | `./prisma/` |
| 生成图表图片 | `./public/charts/` |

备份只需要 copy 这三个目录。不要只备份 `dev.db` 单文件，因为 SQLite 可能同时使用 `dev.db-wal` 和 `dev.db-shm`。

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

部署后重启应用（`docker compose up -d --build` 或 PM2 restart），再验证文献对话与语义检索。

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
改 `docker-compose.yml` 中的 `ports`，如 `"8080:3000"`。

**Q: 内存不够？**
Docker Desktop 设置里把内存限制调到 6 GB。完整镜像包含 Playwright 和 Python 科学计算依赖，首次构建/安装依赖会占用更多内存。

**Q: Windows 上 Docker 很慢？**
确保项目在 WSL2 文件系统中（不要放在 Windows 桌面路径），性能差 5-10 倍。

**Q: docker compose 提示找不到 .env？**
确认已执行 `cp .env.example .env`，并且 `.env` 在项目根目录。

**Q: 图表接口报 Python 找不到？**
确认 `.env` 或 `docker-compose.yml` 中 `PYTHON_CMD=python3`，然后执行：

```bash
docker compose exec app python3 --version
```

**Q: PDF 导出失败？**
当前镜像使用 Playwright 官方运行环境，已经包含 Chromium 和系统依赖。若仍失败，先查看：

```bash
docker compose logs -f app
```
