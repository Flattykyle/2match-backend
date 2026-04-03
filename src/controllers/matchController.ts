import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { calculateCompatibility } from '../utils/compatibility'
import { deleteCache, deleteCachePattern, CACHE_KEYS } from '../services/cacheService'
import { getIsPremium } from '../middleware/premiumGuard'
import { generateConversationStarters, clearStarterCache } from '../services/aiStarter'

export const likeUser = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const { likedUserId } = req.body

    if (!likedUserId) {
      return res.status(400).json({ message: 'likedUserId is required' })
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: req.userId,
          likedUserId,
        },
      },
    })

    if (existingLike) {
      return res.status(400).json({ message: 'User already liked' })
    }

    // Create like
    await prisma.like.create({
      data: {
        likerId: req.userId,
        likedUserId,
      },
    })

    // Check for mutual like (match)
    const mutualLike = await prisma.like.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: likedUserId,
          likedUserId: req.userId,
        },
      },
    })

    if (mutualLike) {
      // Create match (only one match record needed with unique constraint on userId1 and userId2)
      const [smallerId, largerId] = [req.userId, likedUserId].sort()

      await prisma.match.create({
        data: {
          userId1: smallerId,
          userId2: largerId,
          compatibilityScore: 0, // You can calculate this based on your logic
        },
      })

      return res.json({ match: true, message: "It's a match!" })
    }

    return res.json({ match: false, message: 'Like sent' })
  } catch (error) {
    console.error('Like user error:', error)
    return res.status(500).json({ message: 'Error liking user' })
  }
}

/**
 * Express interest in a user from daily picks.
 * Creates a like, checks for mutual match, and returns match data if mutual.
 */
export const expressInterest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const { userId: interestedInUserId } = req.body
    const userId = req.userId

    if (!interestedInUserId) {
      return res.status(400).json({ message: 'userId is required' })
    }

    if (userId === interestedInUserId) {
      return res.status(400).json({ message: 'Cannot express interest in yourself' })
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: interestedInUserId } })
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Check if blocked
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: interestedInUserId },
          { blockerId: interestedInUserId, blockedUserId: userId },
        ],
      },
    })
    if (blocked) {
      return res.status(400).json({ message: 'Cannot interact with this user' })
    }

    // Upsert like (idempotent)
    await prisma.like.upsert({
      where: { likerId_likedUserId: { likerId: userId, likedUserId: interestedInUserId } },
      update: {},
      create: { likerId: userId, likedUserId: interestedInUserId },
    })

    // Remove any existing pass
    await prisma.pass.deleteMany({
      where: { passerId: userId, passedUserId: interestedInUserId },
    })

    // Check for mutual like
    const mutualLike = await prisma.like.findUnique({
      where: { likerId_likedUserId: { likerId: interestedInUserId, likedUserId: userId } },
    })

    let match = null
    let isMatch = false

    if (mutualLike) {
      // Check if match already exists
      const existingMatch = await prisma.match.findFirst({
        where: {
          OR: [
            { userId1: userId, userId2: interestedInUserId },
            { userId1: interestedInUserId, userId2: userId },
          ],
        },
      })

      if (!existingMatch) {
        const currentUser = await prisma.user.findUnique({ where: { id: userId } })
        const compatScore = currentUser
          ? calculateCompatibility(currentUser as any, targetUser as any)
          : 0

        const [smallerId, largerId] = [userId, interestedInUserId].sort()

        match = await prisma.match.create({
          data: {
            userId1: smallerId,
            userId2: largerId,
            compatibilityScore: compatScore,
            status: 'active',
          },
          include: {
            user1: { select: { id: true, firstName: true, profilePictures: true } },
            user2: { select: { id: true, firstName: true, profilePictures: true } },
          },
        })
        isMatch = true
      } else {
        match = existingMatch
        isMatch = true
      }
    }

    // Invalidate caches
    await Promise.all([
      deleteCachePattern(`${CACHE_KEYS.POTENTIAL_MATCHES}${userId}:*`),
      deleteCachePattern(`${CACHE_KEYS.POTENTIAL_MATCHES}${interestedInUserId}:*`),
      deleteCache(`${CACHE_KEYS.DAILY_PICKS}${userId}`),
    ])

    return res.status(200).json({
      message: isMatch ? "It's a 2-Match!" : 'Interest expressed',
      isMatch,
      match,
    })
  } catch (error) {
    console.error('Express interest error:', error)
    return res.status(500).json({ message: 'Error expressing interest' })
  }
}

export const getMatches = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { userId1: req.userId },
          { userId2: req.userId },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            bio: true,
            locationCity: true,
            locationCountry: true,
            profilePictures: true,
            interests: true,
            gender: true,
          },
        },
        user2: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            bio: true,
            locationCity: true,
            locationCountry: true,
            profilePictures: true,
            interests: true,
            gender: true,
          },
        },
      },
      orderBy: { matchedAt: 'desc' },
    })

    return res.json(matches)
  } catch (error) {
    console.error('Get matches error:', error)
    return res.status(500).json({ message: 'Error fetching matches' })
  }
}

// ----------------------------------------
// GET /api/matches/interests-received
// Free: count only. Premium: full profiles.
// ----------------------------------------
export const getInterestsReceived = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const isPremium = await getIsPremium(req.userId)

    // Get likes where current user is the liked one (not yet matched)
    const likes = await prisma.like.findMany({
      where: { likedUserId: req.userId },
      include: isPremium ? {
        liker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            bio: true,
            dateOfBirth: true,
            locationCity: true,
            interests: true,
          },
        },
      } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    if (!isPremium) {
      return res.json({
        count: likes.length,
        profiles: null,
        isPremium: false,
      })
    }

    return res.json({
      count: likes.length,
      profiles: likes.map((l) => ({
        ...(l as any).liker,
        likedAt: l.createdAt,
      })),
      isPremium: true,
    })
  } catch (error) {
    console.error('Get interests received error:', error)
    return res.status(500).json({ message: 'Error fetching interests' })
  }
}

// ----------------------------------------
// GET /api/matches/:matchId/ai-starters
// Returns 3 AI-generated conversation starters
// ----------------------------------------
export const getAiStarters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const { matchId } = req.params

    // Verify user is part of this match
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
    })

    if (!match) {
      return res.status(404).json({ message: 'Match not found' })
    }

    const starters = await generateConversationStarters(matchId, req.userId)

    return res.json({ starters })
  } catch (error) {
    console.error('Get AI starters error:', error)
    return res.status(500).json({ message: 'Error generating conversation starters' })
  }
}

// ----------------------------------------
// POST /api/matches/:matchId/ai-starters/regenerate
// Clears cache and regenerates (max 3 per match)
// ----------------------------------------
export const regenerateAiStarters = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const { matchId } = req.params

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
    })

    if (!match) {
      return res.status(404).json({ message: 'Match not found' })
    }

    const premium = await getIsPremium(req.userId)
    const maxRegenerations = premium ? Infinity : 1

    if (match.aiStarterRegenerations >= maxRegenerations) {
      return res.status(403).json({
        error: 'premium_required',
        feature: 'ai_starters_regeneration',
        message: premium
          ? 'Maximum regenerations reached'
          : 'Free users get 1 regeneration. Upgrade for unlimited!',
        regenerationsUsed: match.aiStarterRegenerations,
      })
    }

    // Increment counter
    await prisma.match.update({
      where: { id: matchId },
      data: { aiStarterRegenerations: { increment: 1 } },
    })

    // Clear cache and regenerate
    await clearStarterCache(matchId, req.userId)
    const starters = await generateConversationStarters(matchId, req.userId)

    return res.json({
      starters,
      regenerationsUsed: match.aiStarterRegenerations + 1,
      regenerationsRemaining: 2 - match.aiStarterRegenerations,
    })
  } catch (error) {
    console.error('Regenerate AI starters error:', error)
    return res.status(500).json({ message: 'Error regenerating conversation starters' })
  }
}
