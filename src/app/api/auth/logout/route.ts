import { NextResponse } from "next/server";
import { clearTokenCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ message: "已退出登录" });
  response.headers.set("Set-Cookie", clearTokenCookie());
  return response;
}
