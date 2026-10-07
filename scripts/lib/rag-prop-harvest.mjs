/**
 * 从 AgentSession.snapshot 抽出待标注主张。
 * hitSources 是当时命中，标注人必须另填该引哪篇，不能把命中当成金标。
 */

export const RAG_PROP_LABEL_NOTE =
  "待标注。hitSources 是当时检索命中，不能当作金标。请把该引的 PDF 文件名或 DOI 填进 expectSources。";

function claimText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return String(value.text ?? value.claim ?? value.query ?? "").trim();
  }
  return "";
}

function sourcesFromObservation(observation) {
  const data = observation?.data ?? {};
  const hits = [...(data.hits ?? []), ...(data.files ?? [])];
  return [...new Set(hits.map((hit) => hit?.source).filter(Boolean))];
}

export function harvestRagPropQueries(snapshot) {
  const transcript = Array.isArray(snapshot?.uiTranscript) ? snapshot.uiTranscript : [];
  const searchActions = transcript.filter(
    (msg) => msg?.kind === "action" && msg.tool === "search_knowledge",
  );
  const searchObservations = (snapshot?.observations ?? []).filter(
    (observation) => observation?.tool === "search_knowledge",
  );
  const rows = [];
  const count = Math.max(searchActions.length, searchObservations.length);
  for (let i = 0; i < count; i++) {
    const action = searchActions[i];
    rows.push({
      query: String(action?.params?.query ?? "").trim(),
      title: String(action?.params?.title ?? "").trim(),
      section: String(action?.params?.section ?? "").trim(),
      hitSources: sourcesFromObservation(searchObservations[i]),
      expectSources: [],
      note: RAG_PROP_LABEL_NOTE,
    });
  }
  for (const msg of transcript) {
    if (msg?.kind !== "action" || msg.tool !== "write_section") continue;
    const claims = Array.isArray(msg.params?.claims) ? msg.params.claims : [];
    for (const claim of claims) {
      const query = claimText(claim);
      if (!query) continue;
      rows.push({
        query,
        title: String(msg.params?.title ?? "").trim(),
        section: String(msg.params?.section ?? "").trim(),
        hitSources: [],
        expectSources: [],
        note: RAG_PROP_LABEL_NOTE,
      });
    }
  }
  return rows;
}
