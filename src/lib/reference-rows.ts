import prisma from "@/lib/prisma";
import { applyReferencePatchOps } from "@/lib/project-references";
import type { ReferenceEvidenceMeta } from "@/contracts/project";

export type ReferenceRowLite = {
  order: number;
  content: string;
  doi: string | null;
  title: string | null;
  abstract: string | null;
  openAccessUrl: string | null;
  externalSource: string | null;
};

/**
 * 读取参考文献行。不用 Prisma select/create 的 doi 等字段名——
 * Turbopack 可能缓存旧 @prisma/client（DMMF 无 doi），显式 select 会直接炸。
 * 证据列走 raw SQL；失败则仅 content（并从题录解析 DOI）。
 */
export async function findReferenceRowsLite(
  projectId: string,
  userId?: string,
): Promise<ReferenceRowLite[]> {
  const whereProject =
    userId != null
      ? { projectId, project: { userId } }
      : { projectId };

  const base = await prisma.reference.findMany({
    where: whereProject,
    orderBy: { order: "asc" },
    select: { order: true, content: true },
  });

  const byOrder = new Map<number, ReferenceRowLite>();
  for (const r of base) {
    byOrder.set(r.order, {
      order: r.order,
      content: r.content,
      doi: null,
      title: null,
      abstract: null,
      openAccessUrl: null,
      externalSource: null,
    });
  }

  try {
    const evidence = await prisma.$queryRaw<
      Array<{
        order: number;
        doi: string | null;
        title: string | null;
        abstract: string | null;
        openAccessUrl: string | null;
        externalSource: string | null;
      }>
    >`
      SELECT "order", doi, title, abstract, "openAccessUrl", "externalSource"
      FROM "Reference"
      WHERE "projectId" = ${projectId}
      ORDER BY "order" ASC
    `;
    for (const e of evidence) {
      const row = byOrder.get(e.order);
      if (!row) continue;
      row.doi = e.doi;
      row.title = e.title;
      row.abstract = e.abstract;
      row.openAccessUrl = e.openAccessUrl;
      row.externalSource = e.externalSource;
    }
  } catch {
    for (const row of byOrder.values()) {
      const m =
        row.content.match(/DOI:\s*(10\.\S+)/i)
        || row.content.match(/\b(10\.\d{4,}\/[^\s]+)/i);
      if (m?.[1]) {
        row.doi = m[1].replace(/[.,;]+$/, "");
      }
    }
  }

  return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

/** 仅 content + 解析/SQL 得到的 DOI，供导入去重 */
export async function loadReferenceDedupKeys(projectId: string): Promise<{
  contents: Set<string>;
  dois: Set<string>;
}> {
  const rows = await findReferenceRowsLite(projectId);
  return {
    contents: new Set(rows.map((r) => r.content.trim())),
    dois: new Set(
      rows
        .map((r) => r.doi?.trim().toLowerCase())
        .filter((d): d is string => Boolean(d)),
    ),
  };
}

/**
 * 写入参考文献：先尝试带证据列的 raw INSERT/UPDATE 路径不可用时，
 * 退化为 Prisma create（仅 content）+ 可选 raw UPDATE 填 meta。
 */
export async function createReferenceWithEvidence(
  projectId: string,
  content: string,
  meta: ReferenceEvidenceMeta,
  index?: number,
): Promise<void> {
  // 1) 仅 content 写入（旧/新 Client 都安全；不经 Prisma 传 doi 等字段）
  await prisma.$transaction(async (tx) => {
    await applyReferencePatchOps(tx, projectId, [
      {
        op: "create",
        content,
        ...(index !== undefined ? { index } : {}),
      },
    ]);
  });

  // 2) raw UPDATE 补证据列（列不存在则静默跳过）
  const hasMeta = Boolean(
    meta.doi || meta.title || meta.abstract || meta.openAccessUrl
    || meta.externalId || meta.externalSource,
  );
  if (!hasMeta) return;

  try {
    if (index !== undefined) {
      await prisma.$executeRaw`
        UPDATE "Reference"
        SET
          doi = ${meta.doi ?? null},
          title = ${meta.title ?? null},
          abstract = ${meta.abstract ?? null},
          "openAccessUrl" = ${meta.openAccessUrl ?? null},
          "externalId" = ${meta.externalId ?? null},
          "externalSource" = ${meta.externalSource ?? null}
        WHERE "projectId" = ${projectId} AND "order" = ${index}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "Reference"
        SET
          doi = ${meta.doi ?? null},
          title = ${meta.title ?? null},
          abstract = ${meta.abstract ?? null},
          "openAccessUrl" = ${meta.openAccessUrl ?? null},
          "externalId" = ${meta.externalId ?? null},
          "externalSource" = ${meta.externalSource ?? null}
        WHERE id = (
          SELECT id FROM "Reference"
          WHERE "projectId" = ${projectId}
          ORDER BY "order" DESC
          LIMIT 1
        )
      `;
    }
  } catch {
    /* 列未 migrate 或权限问题：content 已写入即可 */
  }
}
