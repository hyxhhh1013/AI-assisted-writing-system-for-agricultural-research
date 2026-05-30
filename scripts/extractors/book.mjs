/**
 * 书籍/专著元数据抓取器（骨架，待后续完善）
 *
 * 书籍与论文的核心差异：
 *   - 分块应尽量按章节边界划分，而非固定字符数
 *   - 关键字段：作者、书名、版次、出版社、出版地、出版年、ISBN
 *   - 引用格式：GB/T 7714 [M] 或 APA 无括号样式
 */

/** 从首页提取 ISBN */
export function extractISBN(text) {
  const match = text.match(/ISBN[-：:.\s]*(97[89][-\s]?\d[-\s]?\d{3}[-\s]?\d{5}[-\s]?\d|[\d\-X]{10,17})/i);
  if (!match) return null;
  return match[1].replace(/[\s\-]/g, "");
}

/** 从版权页提取出版社和年份 */
export function extractPublisherInfo(text) {
  const result = {};
  // 中文出版社
  const pubMatch = text.match(/出版社[：:]\s*([^\n，,。]{3,20}出版[社机构]?)/);
  if (pubMatch) result.publisher = pubMatch[1].trim();

  // 出版年份
  const yearMatch = text.match(/出版日期[：:]?\s*(20\d{2}|19[89]\d)|版权所有.{0,20}(20\d{2}|19[89]\d)/);
  if (yearMatch) result.year = parseInt(yearMatch[1] || yearMatch[2], 10);

  return result;
}

/** 检测章节标题行（用于章节感知分块，待实现） */
export function detectChapterHeading(line) {
  return /^(?:第[一二三四五六七八九十百\d]+[章节篇]|Chapter\s+\d+|Section\s+\d+|\d+\.\s+[A-Z\u4e00-\u9fff])/i.test(line.trim());
}
