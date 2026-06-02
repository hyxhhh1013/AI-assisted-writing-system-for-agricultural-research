import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

for (const file of walk(SRC)) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  s = s.replace(/catch \((error|err): any\)/g, "catch ($1: unknown)");
  if (s !== orig) {
    fs.writeFileSync(file, s, "utf8");
    console.log("catch:", path.relative(process.cwd(), file));
  }
}
