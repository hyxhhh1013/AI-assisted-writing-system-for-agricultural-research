/**
 * 失败页补文本。解析结果仍跨栏或未通过时，保留旧句。
 * 深夜窗口之外调用方必须直接退出，不读写索引。
 */

export function isDeepNightWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  return minutes >= 30 && minutes < 5 * 60;
}

/**
 * @param {{ id: string, crossColumn: boolean, shadowText: string, oldText: string }[]} pages
 * @param {(page: { id: string }) => { ok: boolean, text: string, crossColumn: boolean } | null} parsePage
 */
export function repairFailedPages(pages, parsePage) {
  return (pages || []).map((page) => {
    if (!page.crossColumn) {
      return { ...page, text: page.shadowText, repaired: false, keptOld: false };
    }
    const parsed = parsePage(page);
    if (parsed?.ok && parsed.crossColumn === false && parsed.text?.trim()) {
      return { ...page, text: parsed.text, repaired: true, keptOld: false };
    }
    return { ...page, text: page.oldText, repaired: false, keptOld: true };
  });
}
