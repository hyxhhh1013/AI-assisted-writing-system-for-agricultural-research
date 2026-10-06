/** 数学公式定界符转换 — 全项目单一处理源 */

/**
 * 将 AI 输出的各种 LaTeX 风格定界符统一转为 remark-math 兼容的 $$ 或 $：
 * - 多行 [ ... ] → $$ ... $$
 * - 单行整行 [...] → $$ ... $$
 * - 行内 [...] → $...$
 * - \(...\) → $...$
 * 跳过纯数字引用 [1], [1,2], [3-5]。
 */
export function normalizeMathDelimiters(text: string): string {
  if (!text) return text;
  let out = text;

  // 1. 多行 [ ... ]：左括号独占一行 + 公式行 + 右括号独占一行 → $$ ... $$
  out = out.replace(/^\[\s*$/gm, "%%MATH_OPEN%%");
  out = out.replace(/^\s*\]\s*$/gm, "%%MATH_CLOSE%%");
  out = out.replace(/%%MATH_OPEN%%\n([\s\S]*?)\n%%MATH_CLOSE%%/g, (_m: string, inner: string) => {
    return `$$ ${inner.trim()} $$`;
  });

  // 2. 单行整行 [...] → $$...$$
  out = out.replace(/^\[\s*([\s\S]*?)\s*\]$/gm, (_m: string, inner: string) => {
    const t = inner.trim();
    if (!t) return _m;
    if (/^[\d,\s\-–—，、]+$/.test(t)) return _m;
    if (/\\[a-zA-Z]+/.test(t) || /[\^{}_]/.test(t)) {
      return `$$ ${t} $$`;
    }
    return _m;
  });

  // 3. 行内 [...] → $...$
  out = out.replace(/\[\s*([\s\S]*?)\s*\]/g, (_m: string, inner: string) => {
    const t = inner.trim();
    if (!t) return _m;
    if (/^[\d,\s\-–—，、]+$/.test(t)) return _m;
    if (/\\[a-zA-Z]+/.test(t) || /[\^{}_]/.test(t)) {
      return `$${t}$`;
    }
    return _m;
  });

  // 4. \(...\) → $...$
  out = out.replace(/\\\(\s*/g, "$").replace(/\s*\\\)/g, "$");

  // 5. 裸 LaTeX 命令（无定界符）→ $...$
  // 先保护已有的 $...$ 和 $$...$$ 不被误伤
  const mathTokens: string[] = [];
  const TK = (i: number) => `%%MTK${i}%%`;

  // 保护 $$...$$
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m: string, inner: string) => {
    mathTokens.push(`$$${inner}$$`);
    return TK(mathTokens.length - 1);
  });
  // 保护 $...$
  out = out.replace(/\$([^$]+)\$/g, (_m: string, inner: string) => {
    mathTokens.push(`$${inner}$`);
    return TK(mathTokens.length - 1);
  });

  // \ce{H2O} 没有 mhchem。收成公式后占位，避免裸命令正则按第一层花括号切断。
  out = out.replace(/\\ce\{([^{}]+)\}/g, (m: string, inner: string) => {
    const tex = chemicalToTex(inner.replace(/\s+/g, ""));
    if (!tex) return m;
    mathTokens.push(`$${tex}$`);
    return TK(mathTokens.length - 1);
  });

  // 匹配裸 \command（如 \times, \cdot, \alpha 等），不带参数的独立命令
  out = out.replace(/\\(?:times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|partial|nabla|infty|forall|exists|in|notin|subset|supset|cup|cap|emptyset|ldots|cdots|vdots|ddots|quad|qquad|text|mathrm|mathbf|mathit|mathcal|mathbb|frac|sum|int|prod|lim|sqrt|overline|underline|overbrace|underbrace|binom)(?:\{[^}]*\})*(?:[_^](?:\{[^}]*\}|[^_^{}]))*/g, (m: string) => `$${m}$`);

  out = wrapBareNotation(out);

  // 恢复已保护的公式
  out = out.replace(/%%MTK(\d+)%%/g, (_m: string, idx: string) => mathTokens[parseInt(idx, 10)] || _m);

  return out;
}

/** 两字母元素必须写在单字母前面，避免 Cl 被吃成 C。 */
const ELEMENTS = [
  "He", "Li", "Be", "Ne", "Na", "Mg", "Al", "Si", "Cl", "Ar", "Ca", "Sc", "Ti",
  "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Zr", "Nb", "Mo", "Ag", "Cd", "In", "Sn", "Sb", "Te", "Xe", "Ba",
  "Pt", "Au", "Hg", "Pb", "Bi",
  "H", "B", "C", "N", "O", "F", "P", "S", "K", "V", "Y", "I", "W", "U",
];

const UNIT_RE = /^(?:kPa|MPa|mL|kg|mg|cm|mm|km|ha|Pa|kJ|mol|m|g|L|s|h|J|W)(?:\^\{-?\d+\}|\^-?\d+)/;

function elementAt(src: string): string | null {
  for (const el of ELEMENTS) {
    if (src.startsWith(el)) return el;
  }
  return null;
}

function isTokenStart(text: string, i: number): boolean {
  if (i === 0) return true;
  return !/[A-Za-z0-9\\]/.test(text[i - 1] ?? "");
}

function isTokenEnd(text: string, i: number): boolean {
  return i >= text.length || !/[A-Za-z]/.test(text[i] ?? "");
}

/**
 * 把一整段化学式收成 \mathrm{...}。
 * 单元素加数字再加电荷写成上标（Ca2+ → Ca^{2+}）；多元素的数字是下标（NH4+ → NH_{4}^{+}）。
 * 花括号里有字母的下标（Y_{biochar}）不是化学式。
 */
function chemicalToTex(src: string): string | null {
  const parsed = parseChemical(src);
  if (!parsed || parsed.raw !== src) return null;
  return parsed.tex;
}

function parseChemical(src: string): { raw: string; tex: string } | null {
  let i = 0;
  let tex = "";
  let elementCount = 0;
  let marked = false;

  while (i < src.length) {
    const el = elementAt(src.slice(i));
    if (!el) break;
    i += el.length;
    elementCount += 1;
    let sub = "";
    let sup = "";

    if (src.startsWith("_{", i)) {
      const end = src.indexOf("}", i + 2);
      if (end < 0) return null;
      const inner = src.slice(i + 2, end);
      if (!/^\d+$/.test(inner)) return null;
      sub = inner;
      marked = true;
      i = end + 1;
    } else if (src[i] === "_" && /\d/.test(src[i + 1] ?? "")) {
      let j = i + 1;
      while (/\d/.test(src[j] ?? "")) j += 1;
      sub = src.slice(i + 1, j);
      marked = true;
      i = j;
    } else if (/\d/.test(src[i] ?? "")) {
      let j = i;
      while (/\d/.test(src[j] ?? "")) j += 1;
      const digits = src.slice(i, j);
      const sign = src[j];
      const chargeEnds =
        (sign === "+" || sign === "-")
        && elementCount === 1
        && elementAt(src.slice(j)) == null
        && !/[A-Za-z]/.test(src[j + 1] ?? "");
      if (chargeEnds) {
        sup = `${digits}${sign}`;
        marked = true;
        i = j + 1;
      } else {
        sub = digits;
        marked = true;
        i = j;
      }
    }

    if (!sup && src.startsWith("^{", i)) {
      const end = src.indexOf("}", i + 2);
      if (end < 0) return null;
      sup = src.slice(i + 2, end);
      marked = true;
      i = end + 1;
    } else if (!sup && src[i] === "^" && /[-+\d]/.test(src[i + 1] ?? "")) {
      let j = i + 1;
      while (/[-+\d]/.test(src[j] ?? "")) j += 1;
      sup = src.slice(i + 1, j);
      marked = true;
      i = j;
    }

    if (!sup && (src[i] === "+" || src[i] === "-") && !/[A-Za-z]/.test(src[i + 1] ?? "")) {
      sup = src[i] ?? "";
      marked = true;
      i += 1;
    }

    tex += el;
    if (sub) tex += `_{${sub}}`;
    if (sup) tex += `^{${sup}}`;
  }

  if (!marked || elementCount === 0 || i === 0) return null;
  return { raw: src.slice(0, i), tex: `\\mathrm{${tex}}` };
}

function tryChemical(text: string, i: number): { raw: string; tex: string } | null {
  if (!isTokenStart(text, i)) return null;
  const parsed = parseChemical(text.slice(i));
  if (!parsed || !isTokenEnd(text, i + parsed.raw.length)) return null;
  return parsed;
}

function tryVariable(text: string, i: number): string | null {
  if (!isTokenStart(text, i)) return null;
  const m = /^[A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9]+)(?:\^\{[^}]+\}|\^[A-Za-z0-9+-]+)?/.exec(text.slice(i));
  if (!m) return null;
  if (!isTokenEnd(text, i + m[0].length)) return null;
  return m[0];
}

function tryUnit(text: string, i: number): string | null {
  if (!isTokenStart(text, i)) return null;
  const m = UNIT_RE.exec(text.slice(i));
  if (!m || !isTokenEnd(text, i + m[0].length)) return null;
  return m[0];
}

function unitToTex(raw: string): string {
  const braced = /^([A-Za-z]+)\^\{(-?\d+)\}$/.exec(raw);
  if (braced) return `\\mathrm{${braced[1]}}^{${braced[2]}}`;
  const plain = /^([A-Za-z]+)\^(-?\d+)$/.exec(raw);
  if (plain) return `\\mathrm{${plain[1]}}^{${plain[2]}}`;
  return raw;
}

/** 裸化学式、变量下标、单位指数包进 $...$，已有公式的片段不要传进来。 */
function wrapBareNotation(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const chem = tryChemical(text, i);
    if (chem) {
      out += `$${chem.tex}$`;
      i += chem.raw.length;
      continue;
    }
    const variable = tryVariable(text, i);
    if (variable) {
      out += `$${variable}$`;
      i += variable.length;
      continue;
    }
    const unit = tryUnit(text, i);
    if (unit) {
      out += `$${unitToTex(unit)}$`;
      i += unit.length;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}
