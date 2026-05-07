import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@lab.local";
  const password = process.env.ADMIN_PASSWORD || "admin123456";
  const name = process.env.ADMIN_NAME || "管理员";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`管理员账号已存在: ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      name,
      password: hashed,
      role: "admin",
    },
  });

  console.log(`管理员账号创建成功:`);
  console.log(`  邮箱: ${email}`);
  console.log(`  密码: ${password}`);
  console.log(`  请登录后修改密码！`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
