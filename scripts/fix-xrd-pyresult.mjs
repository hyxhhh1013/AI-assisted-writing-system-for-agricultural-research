import fs from "fs";

const files = [
  "src/app/api/xrd/xps/route.ts",
  "src/app/api/xrd/unitcell/route.ts",
  "src/app/api/xrd/simulate/route.ts",
  "src/app/api/xrd/peakfit/route.ts",
  "src/app/api/xrd/bragg/route.ts",
  "src/app/api/xrd/amorphous/route.ts",
];

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("xrd-python")) {
    s = s.replace(
      /import \{ getErrorMessage \}/,
      'import type { XrdPythonJsonResult } from "@/contracts/xrd-python";\nimport { getErrorMessage }',
    );
  }
  s = s.replace(/let pyResult: any = \{\};/g, "let pyResult: XrdPythonJsonResult = {};");
  fs.writeFileSync(f, s);
  console.log("fixed:", f);
}
