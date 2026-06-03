/**
 * Admin CSV 导出工具
 */

import type { AdminProjectRecord, AdminUserRecord } from "@/contracts/admin";

function toCSV<T extends object>(rows: T[], cols: string[], headers: string[]): string {
  const BOM = "﻿";
  const lines = [headers.join(",")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(cols.map(c => {
      const v = String(record[c] ?? "");
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

export function exportUsersCSV(users: AdminUserRecord[]) {
  downloadCSV(
    toCSV(users, ["name", "email", "role", "projectCount", "createdAt"], ["姓名", "邮箱", "角色", "项目数", "注册时间"]),
    `users-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function exportProjectsCSV(projects: AdminProjectRecord[]) {
  downloadCSV(
    toCSV(
      projects,
      ["title", "userName", "template", "mode", "progress", "outlineProgress", "outlineTasksDone", "outlineTasksTotal", "referenceCount", "lastUpdated"],
      ["标题", "作者", "模板", "模式", "章节进度%", "大纲进度%", "大纲已完成", "大纲任务数", "文献数", "最后更新"],
    ),
    `projects-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export interface AdminUsageCsvRow {
  feature: string;
  userId: string;
  timestamp: string;
}

export function exportUsageCSV(entries: AdminUsageCsvRow[]) {
  downloadCSV(
    toCSV(entries, ["feature", "userId", "timestamp"], ["功能", "用户", "时间"]),
    `usage-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
