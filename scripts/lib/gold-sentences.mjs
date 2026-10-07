/** 金句对照。规范化空白和大小写后，抽出的文本必须包含抄录句。 */

export function normalizeGoldText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function matchGoldSentences(text, sentences) {
  const haystack = normalizeGoldText(text);
  return (sentences || []).map((sentence) => {
    const needle = normalizeGoldText(sentence);
    return {
      sentence,
      hit: needle.length > 0 && haystack.includes(needle),
    };
  });
}

export function goldSentencesPass(text, sentences) {
  const rows = matchGoldSentences(text, sentences);
  return rows.length > 0 && rows.every((row) => row.hit);
}
