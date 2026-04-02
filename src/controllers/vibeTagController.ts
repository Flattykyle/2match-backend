import { Request, Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getCache, setCache } from '../services/cacheService'

const MAX_VIBE_TAGS = 5
const VIBE_TAGS_CACHE_KEY = 'vibe-tags:all'
const VIBE_TAGS_CACHE_TTL = 3600 // 1 hour — tags rarely change

// ----------------------------------------
// GET ALL VIBE TAGS (grouped by category)
// GET /api/vibe-tags
// BEFORE: Always hits DB
// AFTER: Cached in Redis for 1 hour
// ----------------------------------------
export const getAllVibeTags = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // Check cache first
    const cached = await getCache<any>(VIBE_TAGS_CACHE_KEY)
    if (cached) {
      res.json({ tags: cached })
      return
    }

    const tags = await prisma.vibeTag.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    })

    // Group by category
    const grouped: Record<string, typeof tags> = {}
    for (const tag of tags) {
      if (!grouped[tag.category]) {
        grouped[tag.category] = []
      }
      grouped[tag.category].push(tag)
    }

    // Cache for 1 hour
    await setCache(VIBE_TAGS_CACHE_KEY, grouped, VIBE_TAGS_CACHE_TTL)

    res.json({ tags: grouped })
  } catch (error) {
    console.error('Get vibe tags error:', error)
    res.status(500).json({ message: 'Error fetching vibe tags' })
  }
}

// ----------------------------------------
// UPDATE USER'S VIBE TAGS
// PUT /api/users/me/vibe-tags
// Body: { tagIds: string[] }
// ----------------------------------------
export const updateUserVibeTags = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { tagIds } = req.body

    if (!Array.isArray(tagIds)) {
      res.status(400).json({ message: 'tagIds must be an array' })
      return
    }

    if (tagIds.length > MAX_VIBE_TAGS) {
      res.status(400).json({ message: `Maximum of ${MAX_VIBE_TAGS} vibe tags allowed` })
      return
    }

    // Validate all tag IDs exist and are active
    if (tagIds.length > 0) {
      const validTags = await prisma.vibeTag.findMany({
        where: { id: { in: tagIds }, isActive: true },
        select: { id: true },
      })

      if (validTags.length !== tagIds.length) {
        res.status(400).json({ message: 'One or more invalid tag IDs' })
        return
      }
    }

    // Update user's vibe tags (replace all with new selection)
    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: {
        vibeTags: {
          set: tagIds.map((id: string) => ({ id })),
        },
      },
      select: {
        id: true,
        vibeTags: true,
      },
    })

    res.json({
      message: 'Vibe tags updated',
      vibeTags: updatedUser.vibeTags,
    })
  } catch (error) {
    console.error('Update vibe tags error:', error)
    res.status(500).json({ message: 'Error updating vibe tags' })
  }
}

// ----------------------------------------
// GET CURRENT USER'S VIBE TAGS
// GET /api/users/me/vibe-tags
// ----------------------------------------
export const getUserVibeTags = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { vibeTags: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json({ vibeTags: user.vibeTags })
  } catch (error) {
    console.error('Get user vibe tags error:', error)
    res.status(500).json({ message: 'Error fetching vibe tags' })
  }
}
