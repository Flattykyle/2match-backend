import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
// import prisma from '../utils/prisma'
// import { getCache, setCache } from '../services/cacheService'

// const PREMIUM_CACHE_TTL = 60 // 1 minute

// ──────────────────────────────────────────────────────────
// BILLING DISABLED — treat every user as premium.
// To re-enable, uncomment the original implementations below
// and remove the stubbed versions.
// ──────────────────────────────────────────────────────────

/**
 * Check if user has an active premium subscription.
 * BILLING DISABLED: always returns true so no features are paywalled.
 */
export const getIsPremium = async (_userId: string): Promise<boolean> => {
  return true

  /* ── Original implementation (re-enable when billing is live) ──
  const cacheKey = `premium:${userId}`
  const cached = await getCache<boolean>(cacheKey)
  if (cached !== null) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true, premiumExpiresAt: true },
  })

  if (!user) return false

  let premium = user.isPremium
  if (premium && user.premiumExpiresAt && new Date(user.premiumExpiresAt) < new Date()) {
    premium = false
    prisma.user.update({
      where: { id: userId },
      data: { isPremium: false, premiumExpiresAt: null },
    }).catch(() => {})
  }

  await setCache(cacheKey, premium, PREMIUM_CACHE_TTL)
  return premium
  */
}

/**
 * Generic premium guard middleware factory.
 * BILLING DISABLED: always passes through.
 */
export const checkPremium = (_feature: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }
    next()
  }
}

/**
 * Free tier daily picks limit: 8/day for free, unlimited for premium.
 * BILLING DISABLED: always passes through (unlimited for everyone).
 */
export const checkDailyPicksLimit = async (
  _req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  next()
}
