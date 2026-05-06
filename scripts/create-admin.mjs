// 管理员账号创建脚本
// 用法: node scripts/create-admin.mjs
// 可通过环境变量配置: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL || "admin@lab.local";
const password = process.env.ADMIN_PASSWORD || "admin123456";
const name = process.env.ADMIN_NAME || "管理员";

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // 如果已存在，升级为 admin
    if (existing.role !== "admin") {
      await prisma.user.update({
        where: { email },
        data: { role: "admin" },
      });
      console.log(`已将 ${email} 升级为管理员`);
    } else {
      console.log(`管理员账号已存在: ${email}`);
    }
  } else {
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, name, password: hashed, role: "admin" },
    });
    console.log("管理员账号创建成功:");
    console.log(`  邮箱: ${email}`);
    console.log(`  密码: ${password}`);
  }
} catch (e) {
  console.error("创建失败:", e.message);
} finally {
  await prisma.$disconnect();
}
