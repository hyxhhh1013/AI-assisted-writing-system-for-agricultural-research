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

  // 匹配裸 \command（如 \times, \cdot, \alpha 等），不带参数的独立命令
  out = out.replace(/\\(?:times|cdot|div|pm|mp|leq|geq|neq|approx|equiv|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|partial|nabla|infty|forall|exists|in|notin|subset|supset|cup|cap|emptyset|ldots|cdots|vdots|ddots|quad|qquad|text|mathrm|mathbf|mathit|mathcal|mathbb|frac|sum|int|prod|lim|sqrt|overline|underline|overbrace|underbrace|binom)(?:\{[^}]*\})*(?:[_^](?:\{[^}]*\}|[^_^{}]))*/g, (m: string) => ` $${m} $`);

  // 匹配带下标的变量（如 Y_{biochar}, x_i）
  out = out.replace(/(?<![A-Za-z])([A-Za-z](?:_\{[^}]+\}|_[A-Za-z0-9])(?:\^\{[^}]+\}|\^[A-Za-z0-9])?)/g, (m: string) => ` $${m} $`);

  // 恢复已保护的公式
  out = out.replace(/%%MTK(\d+)%%/g, (_m: string, idx: string) => mathTokens[parseInt(idx, 10)] || _m);

  return out;
}
