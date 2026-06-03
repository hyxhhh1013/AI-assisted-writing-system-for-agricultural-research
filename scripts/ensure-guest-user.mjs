import { PrismaClient } from "@prisma/client";

const GUEST_ID = "cmotoc1u50000iey3u6ju4zia";
const GUEST_EMAIL = "guest@grainscript.local";

const prisma = new PrismaClient();

try {
  const user = await prisma.user.upsert({
    where: { id: GUEST_ID },
    update: { name: "访客用户" },
    create: {
      id: GUEST_ID,
      email: GUEST_EMAIL,
      name: "访客用户",
      password: "$2a$10$guest.bypass.no.login.hash.placeholder",
    },
  });
  console.log("Guest user ready:", user.id, user.email);
} finally {
  await prisma.$disconnect();
}
