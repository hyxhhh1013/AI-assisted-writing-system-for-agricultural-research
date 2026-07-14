/** PM2 生产进程配置 — VPS 上 standalone 模式用 node server.js */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const root = __dirname;
const fileEnv = loadEnvFile(path.join(root, ".env"));

function pick(key, fallback) {
  return fileEnv[key] ?? process.env[key] ?? fallback;
}

/** 将 DEEPSEEK_API_KEY、DEEPSEEK_API_KEY_2 … 注入 PM2 env（与 src/lib/ai.ts 多 Key 轮转一致） */
function pickKeyFamily(prefix, max = 10) {
  const out = {};
  const main = pick(prefix, "");
  if (main) out[prefix] = main;
  for (let i = 2; i <= max; i++) {
    const k = `${prefix}_${i}`;
    const v = pick(k, "");
    if (v) out[k] = v;
  }
  return out;
}

module.exports = {
  apps: [
    {
      name: "grainscript",
      cwd: root,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "5500M",
      node_args: "--max-old-space-size=4096",
      env: {
        NODE_ENV: "production",
        PORT: pick("PORT", "3000"),
        HOSTNAME: "0.0.0.0",
        PYTHON_CMD: pick("PYTHON_CMD", "python3"),
        DATABASE_URL: pick("DATABASE_URL", ""),
        JWT_SECRET: pick("JWT_SECRET", ""),
        ...pickKeyFamily("DEEPSEEK_API_KEY"),
        ...pickKeyFamily("ZHIPU_API_KEY"),
        RAG_ARTICLES_DIR: pick("RAG_ARTICLES_DIR", "papers"),
        RAG_EMBEDDING_API_KEY: pick("RAG_EMBEDDING_API_KEY", ""),
        RAG_EMBEDDING_API_BASE: pick("RAG_EMBEDDING_API_BASE", ""),
        RAG_EMBEDDING_MODEL: pick("RAG_EMBEDDING_MODEL", ""),
        RAG_EMBEDDINGS_URL: pick("RAG_EMBEDDINGS_URL", ""),
      },
    },
  ],
};
