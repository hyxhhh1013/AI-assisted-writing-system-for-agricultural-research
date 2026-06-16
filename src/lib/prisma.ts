import { PrismaClient } from '@prisma/client'
import { resolveProjectRuntimePath } from '@/lib/runtime-paths'

function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL

  // 如果是 PostgreSQL 连接字符串，直接返回
  if (url && url.startsWith('postgresql://')) {
    return url
  }

  // SQLite 兼容：将相对路径转为绝对路径
  if (url && (url.startsWith('file:./') || url.startsWith('file:.\\'))) {
    const relativePart = url.slice(5)
    const absolutePath = resolveProjectRuntimePath(relativePart)
    return `file:${absolutePath}`
  }

  // 默认使用 SQLite（开发环境）
  return url ?? 'file:./prisma/dev.db'
}

const prismaClientSingleton = () => {
  const dbUrl = resolveDbUrl()

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: dbUrl } },
  })

  // SQLite 专用：启用 WAL 模式（仅当使用 SQLite 时）
  if (dbUrl.startsWith('file:')) {
    client.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
    client.$queryRawUnsafe('PRAGMA busy_timeout=5000').catch(() => {})
  }

  return client
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

function getPrismaClient() {
  // schema 变更后若仍缓存旧 Client（缺 aiUsageLog 等 delegate），在 dev 下自动重建
  if (
    process.env.NODE_ENV !== "production" &&
    globalThis.prisma &&
    typeof (globalThis.prisma as { aiUsageLog?: unknown }).aiUsageLog === "undefined"
  ) {
    globalThis.prisma = undefined;
  }

  const client = globalThis.prisma ?? prismaClientSingleton();
  if (process.env.NODE_ENV !== "production") globalThis.prisma = client;
  return client;
}

const prisma = getPrismaClient()

export default prisma
