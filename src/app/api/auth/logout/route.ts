import { NextResponse } from "next/server";
import { clearTokenCookie } from "@/lib/auth";

export async function POST() {
  try {
    const response = NextResponse.json({ message: "已退出登录" });
    response.headers.set("Set-Cookie", clearTokenCookie());
    return response;
  } catch (error: unknown) {
    return NextResponse.json({ error: "退出登录失败" }, { status: 500 });
  }
}
