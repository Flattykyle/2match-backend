import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getCache, setCache } from '../services/cacheService'

const MATCH_COUNT_CACHE_TTL = 30 // 30 seconds — short TTL for near-realtime accuracy

/**
 * checkSlowMode — if user has slowModeEnabled, count today's matches.
 * BEFORE: Always hits DB for user settings + match count
 * AFTER: Caches today's match count in Redis for 30 seconds
 */
export const checkSlowMode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      return next()
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { slowModeEnabled: true, slowModeLimit: true },
    })

    if (!user || !user.slowModeEnabled) {
      return next()
    }

    // Check cache for today's match count
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const cacheKey = `slowmode:matches:${req.userId}:${today}`

    let todayMatchCount = await getCache<number>(cacheKey)

    if (todayMatchCount === null) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      todayMatchCount = await prisma.match.count({
        where: {
          matchedAt: { gte: todayStart },
          OR: [{ userId1: req.userId }, { userId2: req.userId }],
        },
      })

      await setCache(cacheKey, todayMatchCount, MATCH_COUNT_CACHE_TTL)
    }

    if (todayMatchCount >= user.slowModeLimit) {
      res.status(429).json({
        message: `Slow Mode is on. You've reached your daily limit of ${user.slowModeLimit} matches. Come back tomorrow!`,
        code: 'SLOW_MODE_LIMIT',
        limit: user.slowModeLimit,
        current: todayMatchCount,
      })
      return
    }

    next()
  } catch (error) {
    console.error('checkSlowMode error:', error)
    next()
  }
}

/**
 * checkActiveHours — if the receiving user has activeHours set and the current
 * time is outside their window, return 200 but flag the message as queued.
 * The message is still saved to DB but marked for delayed delivery.
 * Applied before message send controllers.
 */
export const checkActiveHours = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      return next()
    }

    // For message routes, the receiver is determined from the conversation
    // This middleware checks if the RECEIVER has active hours restrictions
    const { conversationId } = req.params
    if (!conversationId) {
      return next()
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { user1Id: true, user2Id: true },
    })

    if (!conversation) {
      return next()
    }

    const receiverId = conversation.user1Id === req.userId
      ? conversation.user2Id
      : conversation.user1Id

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { activeHoursStart: true, activeHoursEnd: true },
    })

    if (!receiver || receiver.activeHoursStart == null || receiver.activeHoursEnd == null) {
      return next()
    }

    const now = new Date()
    const currentHour = now.getUTCHours() // Use UTC; in production, use receiver's timezone

    const start = receiver.activeHoursStart
    const end = receiver.activeHoursEnd

    let isInActiveHours: boolean
    if (start <= end) {
      // e.g., 9-22: active from 9:00 to 22:00
      isInActiveHours = currentHour >= start && currentHour < end
    } else {
      // e.g., 22-6: active from 22:00 to 6:00 (crosses midnight)
      isInActiveHours = currentHour >= start || currentHour < end
    }

    if (!isInActiveHours) {
      // Message is still saved (controller runs), but we flag it as queued
      // The controller can check this flag to skip real-time Socket.IO emission
      ;(req as any).messageQueued = true
      ;(req as any).queueReason = 'Recipient has active hours enabled. Message will be delivered during their active hours.'
    }

    next()
  } catch (error) {
    console.error('checkActiveHours error:', error)
    next() // Don't block on middleware failure
  }
}
