/** 调试引用链：模拟一次写作请求，输出 AI 看到的引用数据 */
import { localRAG, formatRagCitation, resolveBibEntry, cleanSourceName } from "../src/lib/rag.ts";

async function main() {
  // 模拟一次典型写作检索
  const results = await localRAG.search("热解温度催化剂 biomass pyrolysis", { limit: 8 });

  console.log("=== RAG 检索结果 (Top 8) ===\n");
  let idx = 1;
  const seen = new Set();
  for (const c of results) {
    const src = c.metadata.source;
    if (seen.has(src)) continue;
    seen.add(src);

    const entry = resolveBibEntry(src);
    const bib = entry?.bib;
    const gbTag = entry?.gbTag || "";

    console.log(`[${idx}] gbTag=[${gbTag}] documentType=${entry?.documentType || "?"}`);
    console.log(`    formatRagCitation: ${formatRagCitation(c)}`);
    console.log(`    bib.firstAuthor:   ${bib?.firstAuthor || "MISSING"}`);
    console.log(`    bib.year:          ${bib?.year || "MISSING"}`);
    console.log(`    bib.title:         ${(bib?.title || "MISSING").slice(0, 80)}`);
    console.log(`    bib.journal:       ${bib?.journal || "MISSING"}`);
    console.log(`    bib.volume:        ${bib?.volume || "MISSING"}`);
    console.log(`    bib.issue:         ${bib?.issue || "MISSING"}`);
    console.log(`    bib.pages:         ${bib?.pages || "MISSING"}`);
    console.log(`    bib.doi:           ${bib?.doi || "MISSING"}`);
    console.log(`    bib.authors:       ${bib?.authors ? bib.authors.join("; ") : "MISSING"}`);
    console.log("");

    idx++;
    if (idx > 5) break;
  }

  // Now show what refListLines would look like (the data AI gets)
  console.log("=== AI 拿到的 refListLines (实际传给 prompt 的) ===\n");
  const sources = [...seen].slice(0, 5);
  sources.forEach((filename, i) => {
    const entry = resolveBibEntry(filename);
    const bib = entry?.bib;
    const gbTag = entry?.gbTag ? `[${entry.gbTag}]` : "";
    if (bib?.firstAuthor || bib?.year || bib?.journal || bib?.doi) {
      const author = bib.firstAuthor
        ? `${bib.firstAuthor}${Array.isArray(bib.authors) && bib.authors.length > 1 ? " 等" : ""}`
        : "";
      const year = bib.year ? ` (${bib.year})` : "";
      const journal = bib.journal ? ` ${bib.journal}` : "";
      const doi = bib.doi ? ` DOI:${bib.doi}` : "";
      const title = bib.title ? ` "${bib.title}"` : "";
      console.log(`  [${i+1}]${gbTag} ${author}${year}${title}${journal}${doi}`);
    } else {
      console.log(`  [${i+1}] ${cleanSourceName(filename)}`);
    }
  });
}

main().catch(console.error);
