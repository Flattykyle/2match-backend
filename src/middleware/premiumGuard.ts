import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getCache, setCache } from '../services/cacheService'

const PREMIUM_CACHE_TTL = 60 // 1 minute

/**
 * Check if user has an active premium subscription.
 * Caches result for 60s. Checks premiumExpiresAt to handle expired subs.
 */
export const getIsPremium = async (userId: string): Promise<boolean> => {
  const cacheKey = `premium:${userId}`
  const cached = await getCache<boolean>(cacheKey)
  if (cached !== null) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true, premiumExpiresAt: true },
  })

  if (!user) return false

  let premium = user.isPremium
  // If premium but expired, downgrade
  if (premium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) < new Date()) {
    premium = false
    prisma.user.update({
      where: { id: userId },
      data: { isPremium: false, premiumExpiresAt: null },
    }).catch(() => {})
  }

  await setCache(cacheKey, premium, PREMIUM_CACHE_TTL)
  return premium
}

/**
 * Generic premium guard middleware factory.
 * Returns 403 with feature name so the frontend can show the right upsell.
 */
export const checkPremium = (feature: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const premium = await getIsPremium(req.userId)
    if (!premium) {
      res.status(403).json({
        error: 'premium_required',
        feature,
      })
      return
    }

    next()
  }
}

/**
 * Free tier daily picks limit: 8/day for free, unlimited for premium.
 */
export const checkDailyPicksLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) return next()

    const premium = await getIsPremium(req.userId)
    if (premium) return next()

    const FREE_DAILY_PICKS = 8
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const cacheKey = `free:picks:${req.userId}:${today.toISOString().slice(0, 10)}`
    let todayPicks = await getCache<number>(cacheKey)

    if (todayPicks === null) {
      // Count today's profile views as a proxy for "picks seen"
      todayPicks = await prisma.profileView.count({
        where: { viewerId: req.userId, viewedAt: { gte: today } },
      })
      await setCache(cacheKey, todayPicks, 60)
    }

    if (todayPicks >= FREE_DAILY_PICKS) {
      res.status(403).json({
        error: 'premium_required',
        feature: 'unlimited_daily_picks',
        message: `You've seen your ${FREE_DAILY_PICKS} daily picks. Upgrade for unlimited!`,
        limit: FREE_DAILY_PICKS,
        current: todayPicks,
      })
      return
    }

    next()
  } catch {
    next()
  }
}
