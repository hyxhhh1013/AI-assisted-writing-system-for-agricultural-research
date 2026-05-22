import { PrismaClient } from '@prisma/client'
import path from 'path'

function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'

  // 将相对路径转为绝对路径，确保在任何 cwd 下都能正确打开数据库
  if (url.startsWith('file:./') || url.startsWith('file:.\\')) {
    const relativePart = url.slice(5) // 去掉 'file:'
    // 相对于项目根目录（CWD）解析
    const absolutePath = path.resolve(process.cwd(), relativePart)
    return `file:${absolutePath}`
  }

  return url
}

const prismaClientSingleton = () => {
  const dbUrl = resolveDbUrl()

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: { db: { url: dbUrl } },
  })

  // SQLite 专用：启用 WAL 模式，提升并发读性能
  client.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
  client.$queryRawUnsafe('PRAGMA busy_timeout=5000').catch(() => {})

  return client
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
