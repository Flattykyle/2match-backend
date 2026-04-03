import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { calculateCompatibility, getCompatibilityBreakdown, matchesPreferences } from '../utils/compatibility'
import { calculateDistance, formatDistance } from '../utils/location'
import { getCache, setCache, deleteCachePattern, CACHE_KEYS } from '../services/cacheService'

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  lookingFor: true,
  bio: true,
  locationCity: true,
  locationCountry: true,
  latitude: true,
  longitude: true,
  profilePictures: true,
  hobbies: true,
  talents: true,
  interests: true,
  preferences: true,
  voiceIntroUrl: true,
  voiceIntroDuration: true,
  photoShieldEnabled: true,
  isOnline: true,
  lastActive: true,
  emailVerified: true,
  phoneVerified: true,
  photoVerified: true,
  createdAt: true,
  updatedAt: true,
}

const DISCOVERY_CACHE_TTL = 300 // 5 minutes

export const getPotentialMatches = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const {
      limit: limitStr = '20',
      cursor,
      minCompatibility: minCompatStr,
      sortBy = 'compatibility',
      maxDistance: maxDistStr,
      nearMeOnly,
      vibeTags: vibeTagsParam,
    } = req.query as Record<string, string | undefined>

    const limit = parseInt(limitStr) || 20
    const minCompatibility = minCompatStr ? parseInt(minCompatStr) : 0
    const maxDistance = maxDistStr ? parseFloat(maxDistStr) : undefined

    // Check cache
    const cacheKey = `${CACHE_KEYS.POTENTIAL_MATCHES}${userId}:${JSON.stringify(req.query)}`
    const cached = await getCache<any>(cacheKey)
    if (cached) {
      return res.status(200).json(cached)
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    })

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Get excluded user IDs (likes, passes, blocks, matches)
    const [likes, passes, blocksGiven, blocksReceived, matches] = await Promise.all([
      prisma.like.findMany({ where: { likerId: userId }, select: { likedUserId: true } }),
      prisma.pass.findMany({ where: { passerId: userId }, select: { passedUserId: true } }),
      prisma.block.findMany({ where: { blockerId: userId }, select: { blockedUserId: true } }),
      prisma.block.findMany({ where: { blockedUserId: userId }, select: { blockerId: true } }),
      prisma.match.findMany({
        where: { OR: [{ userId1: userId }, { userId2: userId }] },
        select: { userId1: true, userId2: true },
      }),
    ])

    const excludedIds = new Set<string>([userId])
    likes.forEach((l) => excludedIds.add(l.likedUserId))
    passes.forEach((p) => excludedIds.add(p.passedUserId))
    blocksGiven.forEach((b) => excludedIds.add(b.blockedUserId))
    blocksReceived.forEach((b) => excludedIds.add(b.blockerId))
    matches.forEach((m) => {
      excludedIds.add(m.userId1)
      excludedIds.add(m.userId2)
    })
    excludedIds.delete(userId) // remove self if added via matches

    // Fetch candidate users
    const candidates = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedIds) },
      },
      select: {
        ...SAFE_USER_SELECT,
        vibeTags: { select: { id: true, label: true, emoji: true, category: true } },
      },
    })

    // Parse vibe tag filter
    const vibeTagFilter = vibeTagsParam ? vibeTagsParam.split(',').map((t) => t.trim().toLowerCase()) : []

    // In-memory filtering
    const filtered = candidates.filter((candidate) => {
      // Check mutual preference matching
      if (!matchesPreferences(currentUser as any, candidate as any)) return false
      if (!matchesPreferences(candidate as any, currentUser as any)) return false

      // Vibe tag filter
      if (vibeTagFilter.length > 0) {
        const candidateTags = (candidate.vibeTags || []).map((t) => t.label.toLowerCase())
        const hasMatchingTag = vibeTagFilter.some((tag) => candidateTags.includes(tag))
        if (!hasMatchingTag) return false
      }

      // Distance filter
      if (
        (maxDistance || nearMeOnly === 'true') &&
        currentUser.latitude &&
        currentUser.longitude &&
        candidate.latitude &&
        candidate.longitude
      ) {
        const dist = calculateDistance(
          currentUser.latitude,
          currentUser.longitude,
          candidate.latitude,
          candidate.longitude
        )
        const maxDist = maxDistance || 50 // default 50km for nearMeOnly
        if (dist > maxDist) return false
      }

      return true
    })

    // Map with compatibility, breakdown, distance
    const enriched = filtered.map((candidate) => {
      const compatibility = calculateCompatibility(currentUser as any, candidate as any)
      const breakdown = getCompatibilityBreakdown(currentUser as any, candidate as any)

      let distance: number | null = null
      let distanceText: string | null = null
      if (
        currentUser.latitude &&
        currentUser.longitude &&
        candidate.latitude &&
        candidate.longitude
      ) {
        distance = calculateDistance(
          currentUser.latitude,
          currentUser.longitude,
          candidate.latitude,
          candidate.longitude
        )
        distanceText = formatDistance(distance)
      }

      return {
        ...candidate,
        compatibility,
        compatibilityBreakdown: breakdown,
        distance,
        distanceText,
      }
    })

    // Filter by minimum compatibility
    const compatFiltered = minCompatibility > 0
      ? enriched.filter((u) => u.compatibility >= minCompatibility)
      : enriched

    // Sort
    if (sortBy === 'distance') {
      compatFiltered.sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      })
    } else {
      compatFiltered.sort((a, b) => b.compatibility - a.compatibility)
    }

    // Cursor-based pagination
    let startIndex = 0
    if (cursor) {
      const cursorIndex = compatFiltered.findIndex((u) => u.id === cursor)
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1
      }
    }

    const paginatedUsers = compatFiltered.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < compatFiltered.length
    const nextCursor = hasMore ? paginatedUsers[paginatedUsers.length - 1]?.id : null

    const result = {
      users: paginatedUsers,
      pagination: {
        limit,
        total: compatFiltered.length,
        nextCursor,
        hasMore,
      },
    }

    // Cache result
    await setCache(cacheKey, result, DISCOVERY_CACHE_TTL)

    return res.status(200).json(result)
  } catch (error) {
    console.error('Get potential matches error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const invalidateDiscoveryCache = async (userId: string) => {
  await deleteCachePattern(`${CACHE_KEYS.POTENTIAL_MATCHES}${userId}:*`)
}

export const likeUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: likedUserId } = req.params

    if (userId === likedUserId) {
      return res.status(400).json({ error: 'You cannot like yourself' })
    }

    // Check if user exists
    const likedUser = await prisma.user.findUnique({ where: { id: likedUserId } })
    if (!likedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: { likerId_likedUserId: { likerId: userId, likedUserId } },
    })

    if (existingLike) {
      return res.status(400).json({ error: 'You have already liked this user' })
    }

    // Check if blocked
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: likedUserId },
          { blockerId: likedUserId, blockedUserId: userId },
        ],
      },
    })

    if (blocked) {
      return res.status(400).json({ error: 'Cannot like a blocked user' })
    }

    // Create like
    const like = await prisma.like.create({
      data: { likerId: userId, likedUserId },
    })

    // Remove any existing pass
    await prisma.pass.deleteMany({
      where: { passerId: userId, passedUserId: likedUserId },
    })

    // Check for mutual like
    const mutualLike = await prisma.like.findUnique({
      where: { likerId_likedUserId: { likerId: likedUserId, likedUserId: userId } },
    })

    let match = null
    if (mutualLike) {
      // Check if match already exists
      const existingMatch = await prisma.match.findFirst({
        where: {
          OR: [
            { userId1: userId, userId2: likedUserId },
            { userId1: likedUserId, userId2: userId },
          ],
        },
      })

      if (!existingMatch) {
        const compatibility = calculateCompatibility(
          await prisma.user.findUnique({ where: { id: userId } }) as any,
          likedUser as any
        )

        match = await prisma.match.create({
          data: {
            userId1: userId,
            userId2: likedUserId,
            compatibilityScore: compatibility,
            status: 'active',
          },
        })
      }
    }

    // Invalidate discovery caches
    await Promise.all([
      invalidateDiscoveryCache(userId),
      invalidateDiscoveryCache(likedUserId),
    ])

    return res.status(201).json({
      message: mutualLike ? "It's a match!" : 'User liked successfully',
      like,
      match,
      isMatch: !!mutualLike,
    })
  } catch (error) {
    console.error('Like user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const passUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: passedUserId } = req.params

    if (userId === passedUserId) {
      return res.status(400).json({ error: 'You cannot pass on yourself' })
    }

    // Check if user exists
    const passedUser = await prisma.user.findUnique({ where: { id: passedUserId } })
    if (!passedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if already passed
    const existingPass = await prisma.pass.findUnique({
      where: { passerId_passedUserId: { passerId: userId, passedUserId } },
    })

    if (existingPass) {
      return res.status(400).json({ error: 'You have already passed on this user' })
    }

    // Create pass
    const pass = await prisma.pass.create({
      data: { passerId: userId, passedUserId },
    })

    // Invalidate discovery cache
    await invalidateDiscoveryCache(userId)

    return res.status(201).json({ message: 'User passed successfully', pass })
  } catch (error) {
    console.error('Pass user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: blockedUserId } = req.params

    if (userId === blockedUserId) {
      return res.status(400).json({ error: 'You cannot block yourself' })
    }

    // Check if user exists
    const blockedUser = await prisma.user.findUnique({ where: { id: blockedUserId } })
    if (!blockedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if already blocked
    const existingBlock = await prisma.block.findUnique({
      where: { blockerId_blockedUserId: { blockerId: userId, blockedUserId } },
    })

    if (existingBlock) {
      return res.status(400).json({ error: 'User is already blocked' })
    }

    // Create block
    const block = await prisma.block.create({
      data: { blockerId: userId, blockedUserId },
    })

    // Remove any existing likes/passes/matches
    await Promise.all([
      prisma.like.deleteMany({
        where: {
          OR: [
            { likerId: userId, likedUserId: blockedUserId },
            { likerId: blockedUserId, likedUserId: userId },
          ],
        },
      }),
      prisma.pass.deleteMany({
        where: {
          OR: [
            { passerId: userId, passedUserId: blockedUserId },
            { passerId: blockedUserId, passedUserId: userId },
          ],
        },
      }),
      prisma.match.deleteMany({
        where: {
          OR: [
            { userId1: userId, userId2: blockedUserId },
            { userId1: blockedUserId, userId2: userId },
          ],
        },
      }),
    ])

    // Invalidate discovery caches
    await Promise.all([
      invalidateDiscoveryCache(userId),
      invalidateDiscoveryCache(blockedUserId),
    ])

    return res.status(201).json({ message: 'User blocked successfully', block })
  } catch (error) {
    console.error('Block user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const undoPass = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: passedUserId } = req.params

    const pass = await prisma.pass.findUnique({
      where: { passerId_passedUserId: { passerId: userId, passedUserId } },
    })

    if (!pass) {
      return res.status(404).json({ error: 'Pass not found' })
    }

    await prisma.pass.delete({
      where: { id: pass.id },
    })

    // Invalidate discovery cache
    await invalidateDiscoveryCache(userId)

    return res.status(200).json({ message: 'Pass undone successfully' })
  } catch (error) {
    console.error('Undo pass error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const {
      query,
      gender,
      lookingFor,
      minAge,
      maxAge,
      city,
      country,
      hobbies,
      talents,
      interests,
      maxDistance: maxDistStr,
      vibeTags: vibeTagsParam,
      limit: limitStr = '20',
      offset: offsetStr = '0',
    } = req.query as Record<string, string | undefined>

    const limit = parseInt(limitStr) || 20
    const offset = parseInt(offsetStr) || 0

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    })

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Get blocked user IDs
    const [blocksGiven, blocksReceived] = await Promise.all([
      prisma.block.findMany({ where: { blockerId: userId }, select: { blockedUserId: true } }),
      prisma.block.findMany({ where: { blockedUserId: userId }, select: { blockerId: true } }),
    ])

    const blockedIds = new Set<string>([userId])
    blocksGiven.forEach((b) => blockedIds.add(b.blockedUserId))
    blocksReceived.forEach((b) => blockedIds.add(b.blockerId))

    // Build where clause
    const where: any = {
      id: { notIn: Array.from(blockedIds) },
    }

    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
      ]
    }

    if (gender) {
      where.gender = { equals: gender, mode: 'insensitive' }
    }

    if (lookingFor) {
      where.lookingFor = { equals: lookingFor, mode: 'insensitive' }
    }

    if (city) {
      where.locationCity = { contains: city, mode: 'insensitive' }
    }

    if (country) {
      where.locationCountry = { contains: country, mode: 'insensitive' }
    }

    if (hobbies) {
      where.hobbies = { hasSome: hobbies.split(',').map((h) => h.trim()) }
    }

    if (talents) {
      where.talents = { hasSome: talents.split(',').map((t) => t.trim()) }
    }

    if (interests) {
      where.interests = { hasSome: interests.split(',').map((i) => i.trim()) }
    }

    // Fetch users
    const users = await prisma.user.findMany({
      where,
      select: {
        ...SAFE_USER_SELECT,
        vibeTags: { select: { id: true, label: true, emoji: true, category: true } },
      },
    })

    // In-memory filters for age, distance, vibeTags
    let filtered = users

    if (minAge || maxAge) {
      filtered = filtered.filter((u) => {
        const age = Math.floor(
          (Date.now() - new Date(u.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        )
        if (minAge && age < parseInt(minAge)) return false
        if (maxAge && age > parseInt(maxAge)) return false
        return true
      })
    }

    const maxDistance = maxDistStr ? parseFloat(maxDistStr) : undefined
    if (maxDistance && currentUser.latitude && currentUser.longitude) {
      filtered = filtered.filter((u) => {
        if (!u.latitude || !u.longitude) return false
        const dist = calculateDistance(
          currentUser.latitude!,
          currentUser.longitude!,
          u.latitude,
          u.longitude
        )
        return dist <= maxDistance
      })
    }

    // Vibe tag filter
    const vibeTagFilter = vibeTagsParam ? vibeTagsParam.split(',').map((t) => t.trim().toLowerCase()) : []
    if (vibeTagFilter.length > 0) {
      filtered = filtered.filter((u) => {
        const userTags = (u.vibeTags || []).map((t) => t.label.toLowerCase())
        return vibeTagFilter.some((tag) => userTags.includes(tag))
      })
    }

    // Enrich with compatibility and distance
    const enriched = filtered.map((u) => {
      const compatibility = calculateCompatibility(currentUser as any, u as any)
      let distance: number | null = null
      let distanceText: string | null = null
      if (currentUser.latitude && currentUser.longitude && u.latitude && u.longitude) {
        distance = calculateDistance(currentUser.latitude, currentUser.longitude, u.latitude, u.longitude)
        distanceText = formatDistance(distance)
      }
      return { ...u, compatibility, distance, distanceText }
    })

    // Sort by compatibility
    enriched.sort((a, b) => b.compatibility - a.compatibility)

    // Paginate
    const total = enriched.length
    const paginatedUsers = enriched.slice(offset, offset + limit)

    return res.status(200).json({
      users: paginatedUsers,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (error) {
    console.error('Search users error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const unblockUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: blockedUserId } = req.params

    const block = await prisma.block.findUnique({
      where: { blockerId_blockedUserId: { blockerId: userId, blockedUserId } },
    })

    if (!block) {
      return res.status(404).json({ error: 'Block not found' })
    }

    await prisma.block.delete({
      where: { id: block.id },
    })

    // Invalidate discovery caches
    await Promise.all([
      invalidateDiscoveryCache(userId),
      invalidateDiscoveryCache(blockedUserId),
    ])

    return res.status(200).json({ message: 'User unblocked successfully' })
  } catch (error) {
    console.error('Unblock user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const getBlockedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blockedUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const blockedUsers = blocks.map((b) => ({
      ...b.blockedUser,
      blockedAt: b.createdAt,
    }))

    return res.status(200).json({ users: blockedUsers })
  } catch (error) {
    console.error('Get blocked users error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const getLikedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    })

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const likes = await prisma.like.findMany({
      where: { likerId: userId },
      include: {
        likedUser: {
          select: SAFE_USER_SELECT,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const likedUsers = likes.map((l) => {
      const compatibility = calculateCompatibility(currentUser as any, l.likedUser as any)
      return {
        ...l.likedUser,
        compatibility,
        likedAt: l.createdAt,
      }
    })

    return res.status(200).json({ users: likedUsers })
  } catch (error) {
    console.error('Get liked users error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
