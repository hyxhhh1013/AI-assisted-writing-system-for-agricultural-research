/**
 * 从 pdfjs textContent 按 Y 坐标还原行，供英文题录解析
 */

export function groupTextContentLines(textContent) {
  const items = (textContent?.items || [])
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .sort((a, b) => {
      const ay = a.transform?.[5] ?? 0;
      const by = b.transform?.[5] ?? 0;
      if (Math.abs(ay - by) > 2) return by - ay;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });

  const lines = [];
  let bucketY = null;
  let parts = [];

  const flush = () => {
    const line = parts.join(" ").replace(/\s+/g, " ").trim();
    if (line.length > 0) lines.push(line);
    parts = [];
  };

  for (const item of items) {
    const y = Math.round(item.transform?.[5] ?? 0);
    if (bucketY !== null && Math.abs(y - bucketY) > 3) {
      flush();
    }
    bucketY = y;
    parts.push(item.str.trim());
  }
  flush();
  return lines;
}
