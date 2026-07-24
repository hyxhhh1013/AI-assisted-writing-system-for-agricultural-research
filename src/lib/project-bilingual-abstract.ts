import type { BilingualAbstract } from "@/contracts/bilingual-abstract";
import {
  parsePaperPassport,
  serializePaperPassport,
} from "@/contracts/paper-passport";
import prisma from "@/lib/prisma";
import { syncProjectPaperPassport } from "@/lib/project-paper-passport-sync";

/** 主语言写入 Project.abstract，双语写入 Passport.abstractSnapshot */
export async function persistBilingualAbstract(
  projectId: string,
  bilingual: BilingualAbstract,
  primaryLanguage: "zh" | "en",
): Promise<void> {
  const primary = primaryLanguage === "en" ? bilingual.en : bilingual.zh;

  await prisma.project.update({
    where: { id: projectId },
    data: { abstract: primary },
  });

  const rows = await prisma.$queryRaw<{ paperPassport: string | null }[]>`
    SELECT "paperPassport" FROM "Project" WHERE "id" = ${projectId} LIMIT 1
  `;
  const passport = parsePaperPassport(rows[0]?.paperPassport ?? null);
  if (passport) {
    passport.abstractSnapshot = {
      chars: primary.replace(/\s+/g, "").length,
      updatedAt: bilingual.generatedAt,
      zh: bilingual.zh,
      en: bilingual.en,
    };
    passport.updatedAt = bilingual.generatedAt;
    await prisma.$executeRaw`
      UPDATE "Project" SET "paperPassport" = ${serializePaperPassport(passport)}
      WHERE "id" = ${projectId}
    `;
  }

  try {
    await syncProjectPaperPassport(projectId);
  } catch {
    /* ignore */
  }
}
