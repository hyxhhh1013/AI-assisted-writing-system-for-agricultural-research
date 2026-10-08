/**
 * 索引请求准入。
 * 进行中的任务可以附着；只有断线重连（带 x-reindex-cursor）才回放已完成任务。
 * 新的上传 /「更新索引」必须另开进程，不能把上一次的 complete 当成这次的结果。
 */
export type ReindexAdmission = "attach" | "replay" | "start";

export function reindexAdmission(input: {
  childAlive: boolean;
  taskComplete: boolean;
  hasReconnectCursor: boolean;
}): ReindexAdmission {
  if (input.childAlive) return "attach";
  if (input.taskComplete && input.hasReconnectCursor) return "replay";
  return "start";
}
