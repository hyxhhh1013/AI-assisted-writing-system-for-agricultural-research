/**
 * Admin API 响应工具函数
 */
import { NextResponse } from "next/server";
import type { AdminListParams, AdminPaginatedResponse } from "@/contracts/admin";

/** 成功响应 */
export function success<T>(data?: T, message?: string, status = 200) {
  return NextResponse.json({ success: true, data, message }, { status });
}

/** 分页响应 */
export function paginated<T>(
  data: T[],
  total: number,
  params: AdminListParams,
): ReturnType<typeof NextResponse.json<AdminPaginatedResponse<T>>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  return NextResponse.json({
    success: true,
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

/** 404 */
export function notFound(message = "未找到") {
  return NextResponse.json({ success: false, error: message }, { status: 404 });
}

/** 403 */
export function forbidden(message = "无权限") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

/** 400 */
export function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

/** 从 URL 解析分页参数 */
export function parseListParams(searchParams: URLSearchParams): AdminListParams {
  const page = parseInt(searchParams.get("page") || "1", 10) || 1;
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 100);
  return {
    q: searchParams.get("q") || undefined,
    page,
    pageSize,
    sortBy: searchParams.get("sortBy") || undefined,
    sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") || undefined,
    template: searchParams.get("template") || undefined,
    mode: searchParams.get("mode") || undefined,
    category: searchParams.get("category") || undefined,
    risk: searchParams.get("risk") || undefined,
    grade: searchParams.get("grade") || undefined,
    userId: searchParams.get("userId") || undefined,
    projectId: searchParams.get("projectId") || undefined,
    indexStatus: searchParams.get("indexStatus") || undefined,
  };
}
