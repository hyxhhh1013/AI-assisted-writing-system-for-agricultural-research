/**
 * One-off: print local HTML to PDF via Playwright (project devDependency).
 * Usage: node scripts/export-html-to-pdf.mjs <input.html> [output.pdf]
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const input = process.argv[2];
const output =
  process.argv[3] ??
  input?.replace(/\.html?$/i, ".pdf") ??
  path.join(root, "docs/plans/ENG-PR-080-导师确认方案.pdf");

if (!input) {
  console.error("Usage: node scripts/export-html-to-pdf.mjs <input.html> [output.pdf]");
  process.exit(1);
}

const htmlPath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
const pdfPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
  });
  console.log("Wrote:", pdfPath);
} finally {
  await browser.close();
}
