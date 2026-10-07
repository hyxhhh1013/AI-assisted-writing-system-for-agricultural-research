/**
 * 失败页离线补文本。窗口外直接退出，不读写索引。
 * 深夜（北京时间 00:30–05:00）才继续。当前没有失败页清单时也不改线上索引。
 *
 *   node scripts/repair-reading-order-pages.mjs
 */

import { isDeepNightWindow } from "./lib/reading-order-repair.mjs";

const now = process.env.RAG_PROP_NOW ? new Date(process.env.RAG_PROP_NOW) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error("RAG_PROP_NOW 不是有效时间");
  process.exit(1);
}
if (!isDeepNightWindow(now)) {
  console.log("不在深夜窗口 00:30–05:00（北京时间），已退出，未读写索引。");
  process.exit(0);
}
console.log("在深夜窗口内。没有失败页清单，未修改线上索引。");
