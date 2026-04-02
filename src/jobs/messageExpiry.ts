import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'

/**
 * Soft-delete messages where expiresAt < now.
 * These are messages that were sent but never replied to within 7 days.
 * Run this on a cron schedule (every hour).
 */
export const cleanupExpiredMessages = async (): Promise<number> => {
  try {
    const now = new Date()

    const result = await prisma.message.updateMany({
      where: {
        expiresAt: { not: null, lt: now },
        isDeleted: false,
      },
      data: { isDeleted: true },
    })

    if (result.count > 0) {
      logInfo(`Soft-deleted ${result.count} expired messages`)
    }

    return result.count
  } catch (error) {
    logError('Error cleaning up expired messages', error as Error)
    return 0
  }
}

/**
 * Start the hourly expiry cleanup using setInterval.
 * This is a simple in-process cron — for production, use Bull.js or similar.
 */
let intervalId: ReturnType<typeof setInterval> | null = null

export const startMessageExpiryJob = () => {
  // Run immediately once
  cleanupExpiredMessages()

  // Then every hour
  intervalId = setInterval(cleanupExpiredMessages, 60 * 60 * 1000)
  logInfo('Message expiry cleanup job started (every hour)')
}

export const stopMessageExpiryJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logInfo('Message expiry cleanup job stopped')
  }
}
