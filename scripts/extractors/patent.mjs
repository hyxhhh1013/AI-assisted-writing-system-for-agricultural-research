/**
 * 专利文献元数据抓取器（骨架，待后续完善）
 *
 * 专利与论文的核心差异：
 *   - 关键内容在"权利要求（Claims）"章节，而非摘要
 *   - 识别字段：专利号、申请人、发明人、公开日、IPC 分类号
 *   - 引用格式：CN102345678A 或 US10234567B2 样式
 */

/** 从文件名/首页识别专利号 */
export function extractPatentNumber(text) {
  // CN/US/EP/WO 专利号格式
  const match = text.match(/\b(CN|US|EP|WO|JP|KR)\s*(\d{6,12})\s*([A-Z]\d?)?\b/i);
  if (match) return `${match[1].toUpperCase()}${match[2]}${match[3] || ""}`;
  return null;
}

/** 从专利首页提取申请人、发明人、公开日 */
export function extractFromPatentFirstPage(firstPageText) {
  if (!firstPageText) return {};
  const result = {};
  const text = firstPageText.slice(0, 2000);

  const patentNo = extractPatentNumber(text);
  if (patentNo) result.patentNumber = patentNo;

  // 公开日
  const dateMatch = text.match(/公开[（(]公告[）)]?日[：:]?\s*(\d{4}[.\-年]\d{1,2}[.\-月]?\d{0,2})/);
  if (dateMatch) result.publicationDate = dateMatch[1];

  // 申请人
  const applicantMatch = text.match(/申请[（(]专利权[）)]人[：:]?\s*([^\n;；]{2,40})/);
  if (applicantMatch) result.applicant = applicantMatch[1].trim();

  // 发明人
  const inventorMatch = text.match(/发明[（(]设计[）)]人[：:]?\s*([^\n;；]{2,60})/);
  if (inventorMatch) result.inventors = inventorMatch[1].split(/[;；,，]/).map(s => s.trim()).filter(Boolean);

  return result;
}

/** 专利摘要：优先抽取权利要求首项 */
export function extractClaimsSummary(text) {
  const claimsStart = text.search(/权\s*利\s*要\s*求|Claims?\s*:/i);
  if (claimsStart === -1) return null;
  const claimsText = text.slice(claimsStart, claimsStart + 500);
  return claimsText.slice(0, 300).trim();
}
