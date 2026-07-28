import { PrismaClient } from '@prisma/client'
import { resolveProjectRuntimePath } from '@/lib/runtime-paths'

/** 变更 Reference 证据字段 / Prisma 外部化后递增，强制丢弃 HMR 缓存的旧 PrismaClient */
const PRISMA_CLIENT_STAMP = 'reference-evidence-meta-v2'

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
  var __prismaClientStamp: string | undefined
}

type RuntimeDataModelClient = {
  _runtimeDataModel?: {
    models?: Record<string, { fields?: Record<string, unknown> }>
  }
  aiUsageLog?: unknown
  $disconnect?: () => Promise<void>
}

function clientLooksStale(client: RuntimeDataModelClient): boolean {
  if (typeof client.aiUsageLog === 'undefined') return true
  const refFields = client._runtimeDataModel?.models?.Reference?.fields
  // 旧 Client 无 doi：select/create 会报 Unknown field `doi`
  if (refFields && !('doi' in refFields)) return true
  return false
}

function getPrismaClient() {
  if (process.env.NODE_ENV !== 'production') {
    const stampMismatch = globalThis.__prismaClientStamp !== PRISMA_CLIENT_STAMP
    const stale =
      globalThis.prisma != null && clientLooksStale(globalThis.prisma as RuntimeDataModelClient)
    if (stampMismatch || stale) {
      const old = globalThis.prisma as RuntimeDataModelClient | undefined
      void old?.$disconnect?.().catch(() => {})
      globalThis.prisma = undefined
      globalThis.__prismaClientStamp = PRISMA_CLIENT_STAMP
    }
  }

  const client = globalThis.prisma ?? prismaClientSingleton()
  if (process.env.NODE_ENV !== 'production') globalThis.prisma = client
  return client
}

const prisma = getPrismaClient()

export default prisma
