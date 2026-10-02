import fs from "fs";

/**
 * PDF 导出与健康探测共用：先看环境变量和系统 Chrome，再回落到 Playwright 自带包。
 */
export function chromiumCandidatePaths(): string[] {
  const env = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROMIUM_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);

  const system =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : [
          "/usr/bin/google-chrome-stable",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium-browser",
          "/usr/bin/chromium",
          "/snap/bin/chromium",
        ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...env, ...system]) {
    const p = raw.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function detectChromium(): { available: boolean; path: string | null } {
  for (const p of chromiumCandidatePaths()) {
    if ((p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) && fs.existsSync(p)) {
      return { available: true, path: p };
    }
  }
  try {
    // playwright 可能未装；探测失败不当成健康接口错误
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chromium } = require("playwright") as {
      chromium: { executablePath: () => string };
    };
    const execPath = chromium.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      return { available: true, path: execPath };
    }
    return { available: false, path: execPath || null };
  } catch {
    return { available: false, path: null };
  }
}
