import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getCache, setCache } from '../services/cacheService'

const FREE_DAILY_MATCH_LIMIT = 5
const TIER_CACHE_TTL = 60 // 1 minute

type Tier = 'FREE' | 'PREMIUM' | 'PLATINUM'

/**
 * Get user's effective subscription tier (checks expiry).
 * Caches for 60s to avoid hitting DB on every request.
 */
export const getUserTier = async (userId: string): Promise<Tier> => {
  const cacheKey = `sub:tier:${userId}`
  const cached = await getCache<Tier>(cacheKey)
  if (cached) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionExpiresAt: true },
  })

  if (!user) return 'FREE'

  let tier: Tier = user.subscriptionTier as Tier
  // If subscription expired, treat as FREE
  if (tier !== 'FREE' && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    tier = 'FREE'
    // Update DB asynchronously (don't block)
    prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: 'FREE', subscriptionExpiresAt: null },
    }).catch(() => {})
  }

  await setCache(cacheKey, tier, TIER_CACHE_TTL)
  return tier
}

/**
 * Middleware: require PREMIUM or higher tier.
 */
export const requirePremium = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) { res.status(401).json({ message: 'Not authenticated' }); return }

  const tier = await getUserTier(req.userId)
  if (tier === 'FREE') {
    res.status(403).json({
      message: 'This feature requires Premium or Platinum.',
      code: 'PREMIUM_REQUIRED',
      requiredTier: 'PREMIUM',
    })
    return
  }
  next()
}

/**
 * Middleware: require PLATINUM tier.
 */
export const requirePlatinum = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) { res.status(401).json({ message: 'Not authenticated' }); return }

  const tier = await getUserTier(req.userId)
  if (tier !== 'PLATINUM') {
    res.status(403).json({
      message: 'This feature requires Platinum.',
      code: 'PLATINUM_REQUIRED',
      requiredTier: 'PLATINUM',
    })
    return
  }
  next()
}

/**
 * Middleware: enforce FREE tier daily like limit (5/day).
 * If PREMIUM/PLATINUM, skip. If FREE, count today's likes.
 */
export const checkFreeTierLikeLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) return next()

    const tier = await getUserTier(req.userId)
    if (tier !== 'FREE') return next() // Paid users have unlimited

    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `free:likes:${req.userId}:${today}`

    let todayLikes = await getCache<number>(cacheKey)
    if (todayLikes === null) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      todayLikes = await prisma.like.count({
        where: { likerId: req.userId, createdAt: { gte: todayStart } },
      })
      await setCache(cacheKey, todayLikes, 60) // Cache 60s
    }

    if (todayLikes >= FREE_DAILY_MATCH_LIMIT) {
      res.status(429).json({
        message: `You've reached your free daily limit of ${FREE_DAILY_MATCH_LIMIT} likes. Upgrade to Premium for unlimited!`,
        code: 'FREE_TIER_LIMIT',
        limit: FREE_DAILY_MATCH_LIMIT,
        current: todayLikes,
      })
      return
    }

    next()
  } catch (error) {
    console.error('checkFreeTierLikeLimit error:', error)
    next()
  }
}
