/**
 * 线上 PDF 阅读顺序（晋级前不变）：先按 Y 自上而下，同一行再按 X。
 * 双栏同一基线会把左右栏拼进同一行。影子抽取不要走这里。
 */

export function sortTextItemsLegacy(items) {
  return (items || [])
    .filter((item) => typeof item?.str === "string" && item.str.trim())
    .sort((a, b) => {
      const ay = a.transform?.[5] ?? 0;
      const by = b.transform?.[5] ?? 0;
      if (Math.abs(ay - by) > 2) return by - ay;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });
}

export function joinLegacyPageText(items) {
  return sortTextItemsLegacy(items)
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
