import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashPassword, signToken, createTokenCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, name, password, confirmPassword } = await req.json();

    if (!email || !name || !password || !confirmPassword) {
      return NextResponse.json({ error: "所有字段都是必填的" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "密码长度至少 8 位" }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "两次密码输入不一致" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, password: hashed },
    });

    const token = await signToken(user.id);
    const response = NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
    response.headers.set("Set-Cookie", createTokenCookie(token));

    return response;
  } catch (error) {
    logger.error("Register error:", error);
    return NextResponse.json({ error: "注册失败" }, { status: 500 });
  }
}
