import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  // 启用 SQLite WAL 模式，提升并发读性能
  client.$executeRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
  client.$executeRawUnsafe('PRAGMA busy_timeout=5000').catch(() => {})

  return client
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
