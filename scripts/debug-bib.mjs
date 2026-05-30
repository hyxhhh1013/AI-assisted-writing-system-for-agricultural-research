import { localRAG, formatRagCitation, resolveBibEntry, cleanSourceName } from "@/lib/rag";

async function main() {
  const results = await localRAG.search("pyrolysis biomass", { limit: 5 });

  for (const c of results) {
    const source = c.metadata.source;
    const entry = resolveBibEntry(source);
    console.log("=== CHUNK ===");
    console.log("Source:", source);
    console.log("formatRagCitation:", formatRagCitation(c));
    console.log("Bib entry:", JSON.stringify(entry?.bib, null, 2));
    console.log("gbTag:", entry?.gbTag, "documentType:", entry?.documentType);
    console.log("");
  }
}

main();
