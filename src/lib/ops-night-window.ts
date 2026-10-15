/** 与 scripts/lib/reading-order-repair.mjs 的深夜窗口一致：北京时间 00:30–05:00。 */
export function isShanghaiDeepNight(date = new Date()): boolean {
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
