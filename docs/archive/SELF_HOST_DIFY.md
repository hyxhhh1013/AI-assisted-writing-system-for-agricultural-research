# Dify 本地私有化部署指南 (完全免费)

为了避开 Dify 官方云端的订阅费用，并确保实验室数据（如热化学小组的文章）不出内网，我们建议采用 Docker 本地化部署。

## 1. 前置要求
*   安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) 或 Docker Engine (Linux)。
*   确保本地有至少 8GB 内存空间。

## 2. 部署步骤

### 第一步：克隆 Dify 官方仓库
在项目根目录之外（或任意你存放工具的目录），打开终端执行：
```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
```

### 第二步：配置环境变量
```bash
cp .env.example .env
```
*(注：默认配置通常无需修改，除非端口冲突)*

### 第三步：启动容器
```bash
docker-compose up -d
```
等待镜像下载并启动。这可能需要几分钟，取决于你的网速。

### 第四步：初始化设置
1. 启动完成后，在浏览器访问：`http://localhost` (或 `http://127.0.0.1`)。
2. 设置管理员账户名和密码。
3. 进入后台，按照之前的“保姆级指南”创建应用、上传 `热化学小组文章-2024.12.27` 文件夹中的 PDF。

## 3. 关联本项目
1. 在本地 Dify 后台生成 API Key。
2. 在本项目的 `.env.local` 中配置：
   ```bash
   DIFY_API_KEY=你的本地Dify应用API密钥
   DIFY_API_URL=http://localhost/v1
   ```

## 4. 维护常用命令
*   **停止服务**：`docker-compose stop`
*   **启动服务**：`docker-compose start`
*   **查看状态**：`docker-compose ps`
*   **更新 Dify**：
    ```bash
    git pull origin main
    docker-compose down
    docker-compose pull
    docker-compose up -d
    ```
