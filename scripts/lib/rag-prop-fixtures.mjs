/**
 * 主张题库。缺 expectSources 的题拒绝入库。
 * hitSources 若出现，只是当时命中，不是金标。
 */

export function parseRagPropQueries(input) {
  if (!Array.isArray(input)) {
    throw new Error("题库必须是数组");
  }
  return input.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`第 ${index} 题不是对象`);
    }
    const query = String(row.query ?? "").trim();
    const title = String(row.title ?? "").trim();
    const section = String(row.section ?? "").trim();
    const note = String(row.note ?? "").trim();
    if (!query) throw new Error(`第 ${index} 题缺少 query`);
    if (!Array.isArray(row.expectSources) || row.expectSources.length < 1 || row.expectSources.length > 2) {
      throw new Error(`第 ${index} 题缺少 expectSources`);
    }
    const expectSources = row.expectSources.map((source) => String(source).trim());
    if (expectSources.some((source) => !source)) {
      throw new Error(`第 ${index} 题缺少 expectSources`);
    }
    return { query, title, section, expectSources, note };
  });
}
