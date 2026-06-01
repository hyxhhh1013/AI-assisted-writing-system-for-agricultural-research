/** PM2 生产进程配置 — VPS 上 standalone 模式用 node server.js */
module.exports = {
  apps: [
    {
      name: "grainscript",
      cwd: __dirname,
      script: "server.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        PYTHON_CMD: "python3",
      },
    },
  ],
};
