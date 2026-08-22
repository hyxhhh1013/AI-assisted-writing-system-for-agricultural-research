import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const py =
  process.env.PYTHON_CMD?.trim() ||
  (process.platform === "win32" ? "python" : "python3");
const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "charts",
  "test_figures.py",
);
const result = spawnSync(py, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
});
process.exit(result.status ?? 1);
