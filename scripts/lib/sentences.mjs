/**
 * 命题分句。句末标点才断开；分号留在同一句里。短句不丢。
 * 尚未接入线上切块。
 */

function segmenterFor(text) {
  const locale = /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
  return new Intl.Segmenter(locale, { granularity: "sentence" });
}

export function splitSentences(text) {
  const source = String(text ?? "");
  if (!source.trim()) return [];
  const raw = [...segmenterFor(source).segment(source)].map((part) => part.segment);
  const sentences = [];
  let buffer = "";
  for (const part of raw) {
    buffer += part;
    const trimmed = buffer.trimEnd();
    const last = trimmed[trimmed.length - 1];
    if (last === ";" || last === "；") continue;
    const sentence = buffer.trim();
    if (sentence) sentences.push(sentence);
    buffer = "";
  }
  if (buffer.trim()) sentences.push(buffer.trim());
  return sentences;
}
