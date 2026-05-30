import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

// 认证临时关闭 — 默认访客用户
const GUEST_USER = {
  id: "cmotoc1u50000iey3u6ju4zia",
  email: "guest@grainscript.local",
  name: "访客用户",
  createdAt: new Date().toISOString(),
};

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (token) {
      const userId = await verifyToken(token);
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, createdAt: true },
        });
        if (user) {
          return NextResponse.json(user);
        }
      }
    }
    // 认证临时关闭 — 无有效 token 时返回默认访客用户
    return NextResponse.json(GUEST_USER);
  } catch (error) {
    logger.error("Me error:", error);
    return NextResponse.json(GUEST_USER);
  }
}
