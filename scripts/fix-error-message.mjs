import fs from "fs";
import path from "path";

const IMPORT = 'import { getErrorMessage } from "@/lib/error-utils";\n';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

for (const file of walk(path.join(process.cwd(), "src"))) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("catch (") || !s.includes(": unknown)")) continue;
  if (!/\b(error|err)\.message\b/.test(s)) continue;

  const orig = s;
  s = s.replace(/\berror\.message\b/g, "getErrorMessage(error)");
  s = s.replace(/\berr\.message\b/g, "getErrorMessage(err)");

  if (!s.includes("getErrorMessage")) continue;
  if (!s.includes('from "@/lib/error-utils"')) {
    const lines = s.split("\n");
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) insertAt = i + 1;
      else if (insertAt > 0 && lines[i].trim() && !lines[i].startsWith("import ")) break;
    }
    lines.splice(insertAt, 0, IMPORT.trimEnd());
    s = lines.join("\n");
  }

  if (s !== orig) {
    fs.writeFileSync(file, s, "utf8");
    console.log(path.relative(process.cwd(), file));
  }
}
