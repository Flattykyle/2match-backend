import { Request, Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getCache, setCache } from '../services/cacheService'

const MIN_VIBE_TAGS = 3
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

    if (tagIds.length < MIN_VIBE_TAGS || tagIds.length > MAX_VIBE_TAGS) {
      res.status(400).json({ message: `Select between ${MIN_VIBE_TAGS} and ${MAX_VIBE_TAGS} vibe tags` })
      return
    }

    // Validate all tag IDs exist and are active
    const validTags = await prisma.vibeTag.findMany({
      where: { id: { in: tagIds }, isActive: true },
      select: { id: true },
    })

    if (validTags.length !== tagIds.length) {
      res.status(400).json({ message: 'One or more invalid tag IDs' })
      return
    }

    // Replace user's vibe tags via explicit join table
    await prisma.$transaction([
      // Delete all existing
      prisma.userVibeTag.deleteMany({ where: { userId: req.userId } }),
      // Insert new ones
      prisma.userVibeTag.createMany({
        data: tagIds.map((vibeTagId: string) => ({ userId: req.userId!, vibeTagId })),
      }),
    ])

    // Fetch updated tags
    const updated = await prisma.userVibeTag.findMany({
      where: { userId: req.userId },
      include: { vibeTag: true },
    })

    res.json({
      message: 'Vibe tags updated',
      vibeTags: updated.map((uvt) => uvt.vibeTag),
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

    const userVibeTags = await prisma.userVibeTag.findMany({
      where: { userId: req.userId },
      include: { vibeTag: true },
    })

    res.json({ vibeTags: userVibeTags.map((uvt) => uvt.vibeTag) })
  } catch (error) {
    console.error('Get user vibe tags error:', error)
    res.status(500).json({ message: 'Error fetching vibe tags' })
  }
}
