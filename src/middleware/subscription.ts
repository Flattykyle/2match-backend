import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
// import prisma from '../utils/prisma'
// import { getCache, setCache } from '../services/cacheService'

// const FREE_DAILY_MATCH_LIMIT = 5
// const TIER_CACHE_TTL = 60 // 1 minute

type Tier = 'FREE' | 'PREMIUM' | 'PLATINUM'

// ──────────────────────────────────────────────────────────
// BILLING DISABLED — treat every user as PREMIUM.
// To re-enable, uncomment the original implementations below
// and remove the stubbed versions.
// ──────────────────────────────────────────────────────────

/**
 * Get user's effective subscription tier.
 * BILLING DISABLED: always returns PREMIUM.
 */
export const getUserTier = async (_userId: string): Promise<Tier> => {
  return 'PREMIUM'

  /* ── Original implementation (re-enable when billing is live) ──
  const cacheKey = `sub:tier:${userId}`
  const cached = await getCache<Tier>(cacheKey)
  if (cached) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionExpiresAt: true },
  })

  if (!user) return 'FREE'

  let tier: Tier = user.subscriptionTier as Tier
  if (tier !== 'FREE' && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date()) {
    tier = 'FREE'
    prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: 'FREE', subscriptionExpiresAt: null },
    }).catch(() => {})
  }

  await setCache(cacheKey, tier, TIER_CACHE_TTL)
  return tier
  */
}

/**
 * Middleware: require PREMIUM or higher tier.
 * BILLING DISABLED: always passes through.
 */
export const requirePremium = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) { res.status(401).json({ message: 'Not authenticated' }); return }
  next()
}

/**
 * Middleware: require PLATINUM tier.
 * BILLING DISABLED: always passes through.
 */
export const requirePlatinum = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.userId) { res.status(401).json({ message: 'Not authenticated' }); return }
  next()
}

/**
 * Middleware: enforce FREE tier daily like limit (5/day).
 * BILLING DISABLED: always passes through (unlimited for everyone).
 */
export const checkFreeTierLikeLimit = async (
  _req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  next()
}
