import { PrismaClient } from '@prisma/client'

// Use a single PrismaClient instance to avoid connection pool issues
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isDev = process.env.NODE_ENV === 'development'

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev
      ? [
          { emit: 'event', level: 'query' },  // Capture queries as events for slow-query logging
          { emit: 'stdout', level: 'error' },
          { emit: 'stdout', level: 'warn' },
        ]
      : [{ emit: 'stdout', level: 'error' }],
  })

// ── Slow query logging middleware (development only) ──
// Logs any Prisma query taking longer than 100ms to the console
const SLOW_QUERY_THRESHOLD_MS = 100

if (isDev) {
  ;(prisma as any).$on('query', (e: any) => {
    const duration = e.duration as number
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `\x1b[33m[SLOW QUERY]\x1b[0m ${duration}ms — ${e.query}`
      )
      if (e.params && e.params !== '[]') {
        console.warn(`  Params: ${e.params}`)
      }
    }
  })
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
