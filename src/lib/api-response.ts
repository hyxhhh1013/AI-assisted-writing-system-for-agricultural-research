import { NextResponse } from "next/server";

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: Record<string, string[]>;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data } satisfies ApiSuccessResponse<T>, { status });
}

export function errorResponse(message: string, status = 500, details?: Record<string, string[]>) {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) } satisfies ApiErrorResponse,
    { status }
  );
}

export function unauthorizedResponse(message = "未登录或登录已过期") {
  return errorResponse(message, 401);
}

export function notFoundResponse(message = "资源不存在") {
  return errorResponse(message, 404);
}

export function validationErrorResponse(errors: Record<string, string[]>) {
  return errorResponse("请求参数校验失败", 400, errors);
}
