/** PM2 生产进程配置 — VPS 上 next start */
module.exports = {
  apps: [
    {
      name: "grainscript",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
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
