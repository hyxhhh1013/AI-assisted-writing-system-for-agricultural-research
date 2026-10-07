/** recall@10：期望来源是否出现在前 10 个来源里。 */

function normSource(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^doi:/, "");
}

export function sourceInTop10(expectSources, rankedSources) {
  const top = (rankedSources || []).slice(0, 10).map(normSource).filter(Boolean);
  return (expectSources || []).some((expected) => {
    const needle = normSource(expected);
    if (!needle) return false;
    return top.some(
      (hit) => hit === needle || hit.endsWith(`/${needle}`) || hit.endsWith(needle),
    );
  });
}

/** @param {{ expectSources: string[], rankedSources: string[] }[]} cases */
export function recallAt10(cases) {
  if (!cases?.length) return 0;
  const hits = cases.filter((row) => sourceInTop10(row.expectSources, row.rankedSources)).length;
  return hits / cases.length;
}
