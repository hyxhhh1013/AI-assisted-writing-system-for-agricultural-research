/**
 * Admin CSV 导出工具
 */

function toCSV(rows: Record<string, unknown>[], cols: string[], headers: string[]): string {
  const BOM = "﻿";
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(cols.map(c => {
      const v = String(row[c] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(","));
  }
  return BOM + lines.join("\n");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportUsersCSV(users: any[]) {
  downloadCSV(
    toCSV(users, ["name", "email", "role", "projectCount", "createdAt"], ["姓名", "邮箱", "角色", "项目数", "注册时间"]),
    `users-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportProjectsCSV(projects: any[]) {
  downloadCSV(
    toCSV(projects, ["title", "userName", "template", "mode", "progress", "referenceCount", "lastUpdated"], ["标题", "作者", "模板", "模式", "进度%", "文献数", "最后更新"]),
    `projects-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportUsageCSV(entries: any[]) {
  downloadCSV(
    toCSV(entries, ["feature", "userId", "timestamp"], ["功能", "用户", "时间"]),
    `usage-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
