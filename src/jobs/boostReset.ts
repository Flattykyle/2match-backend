import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'

/**
 * Reset weekly boosts for Platinum users every Monday.
 * Run this on a cron schedule (check every hour, only execute on Monday 0:00-0:59 UTC).
 */
export const resetWeeklyBoosts = async (): Promise<void> => {
  try {
    const now = new Date()
    // Only run on Monday (day 1) between 00:00-00:59 UTC
    if (now.getUTCDay() !== 1 || now.getUTCHours() !== 0) return

    const result = await prisma.user.updateMany({
      where: {
        subscriptionTier: 'PLATINUM',
        subscriptionExpiresAt: { gt: now }, // Still active
      },
      data: {
        weeklyBoostsRemaining: 1,
        lastBoostResetAt: now,
      },
    })

    if (result.count > 0) {
      logInfo(`Reset weekly boosts for ${result.count} Platinum users`)
    }
  } catch (error) {
    logError('Error resetting weekly boosts', error as Error)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export const startBoostResetJob = () => {
  // Check every hour
  intervalId = setInterval(resetWeeklyBoosts, 60 * 60 * 1000)
  logInfo('Boost reset job started (checks every hour, resets on Mondays)')
}

export const stopBoostResetJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
