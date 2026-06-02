import fs from "fs";
import path from "path";

const patterns = [
  [
    /import \{\r?\nimport \{ getErrorMessage \} from "@\/lib\/error-utils";\r?\n/g,
    'import { getErrorMessage } from "@/lib/error-utils";\nimport {\n',
  ],
  [
    /import type \{\r?\nimport \{ getErrorMessage \} from "@\/lib\/error-utils";\r?\n/g,
    'import { getErrorMessage } from "@/lib/error-utils";\nimport type {\n',
  ],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const f of walk("src")) {
  let s = fs.readFileSync(f, "utf8");
  let changed = false;
  for (const [re, replacement] of patterns) {
    const n = s.replace(re, replacement);
    if (n !== s) {
      s = n;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, s);
    console.log("fixed:", f);
  }
}
