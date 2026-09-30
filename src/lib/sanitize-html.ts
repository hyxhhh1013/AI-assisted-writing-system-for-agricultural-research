import DOMPurify from "isomorphic-dompurify";

const EVENT_ATTRS = [
  "onload",
  "onerror",
  "onclick",
  "onmouseover",
  "onfocus",
  "onblur",
  "onsubmit",
  "onanimationstart",
  "onmouseenter",
  "onmouseleave",
] as const;

/** 图表预览 HTML/SVG 消毒：允许 svg+html，禁止 script 与事件属性。 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { svg: true, html: true },
    FORBID_TAGS: ["script"],
    FORBID_ATTR: [...EVENT_ATTRS],
  });
}
