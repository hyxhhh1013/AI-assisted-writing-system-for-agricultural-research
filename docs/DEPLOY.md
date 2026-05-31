# 部署指南

> **腾讯云 VPS 自动部署**（推荐）：推 `main` 即发布。见 [DEPLOY_VPS.md](./DEPLOY_VPS.md)。  
> **开发 / 提交规范**：见 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)。

## 环境要求

- Docker Desktop（Windows/Mac）或 Docker Engine（Linux）
- 至少 4 GB 空闲内存给 Docker

## 实验室电脑部署步骤

### 1. 安装 Docker Desktop

从 https://www.docker.com/products/docker-desktop/ 下载安装。
安装后重启电脑。

### 2. 确认 .env.local 配置正确

项目根目录的 `.env.local` 需要包含：

```
DEEPSEEK_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx      # 可选，不配则自动降级为 DeepSeek
JWT_SECRET=你的随机密钥  # 改掉默认值！
DATABASE_URL=file:./prisma/dev.db
```

### 3. 构建并启动

```bash
cd 论文助手
docker compose up -d --build
```

第一次构建需要 3-5 分钟（下载镜像 + npm install）。之后启动只需要几秒。

### 4. 访问

浏览器打开：`http://localhost:3000`

实验室其他同学通过这台电脑的 IP 访问：`http://192.168.x.x:3000`

### 5. 查看日志

```bash
docker compose logs -f
```

### 6. 更新代码后重新部署

```bash
git pull
docker compose up -d --build
```

### 7. 停止

```bash
docker compose down
```

## 数据持久化

以下数据保存在宿主机上，容器删除不会丢失：

| 数据 | 路径 |
|------|------|
| 知识库 PDF 索引 | `./data/` |
| 数据库（用户、项目、论文） | `./prisma/dev.db` |

备份只需要 copy 这两个目录/文件。

## 常见问题

**Q: 端口 3000 被占用？**
改 `docker-compose.yml` 中的 `ports`，如 `"8080:3000"`。

**Q: 内存不够？**
Docker Desktop 设置里把内存限制调到 2 GB——Next.js standalone 实际只需要 ~300 MB。

**Q: Windows 上 Docker 很慢？**
确保项目在 WSL2 文件系统中（不要放在 Windows 桌面路径），性能差 5-10 倍。
