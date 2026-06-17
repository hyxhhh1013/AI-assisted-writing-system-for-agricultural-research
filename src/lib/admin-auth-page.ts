import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

const DEV_BYPASS_USER_ID = "cmotoc1u50000iey3u6ju4zia";

function isAuthBypassEnabled(): boolean {
  if (process.env.AUTH_BYPASS !== "true") return false;
  if (process.env.NODE_ENV === "production") return false;
  return true;
}

/** Server Component 用：校验管理员并返回用户，否则 redirect */
export async function requireAdminPage() {
  let userId: string | null = null;

  if (isAuthBypassEnabled()) {
    userId = DEV_BYPASS_USER_ID;
  } else {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (token) userId = await verifyToken(token);
  }

  if (!userId) redirect("/login?redirect=/admin");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user || user.role !== "admin") redirect("/");

  return user;
}
