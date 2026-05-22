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

  return out;
}
