import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { calculateCompatibility, getCompatibilityBreakdown, matchesPreferences } from '../utils/compatibility'
import { calculateDistance, formatDistance } from '../utils/location'
import { getCache, setCache, deleteCachePattern, CACHE_KEYS } from '../services/cacheService'

// Select only the fields we need — avoids fetching password, tokens, etc.
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
} as const

const DISCOVERY_CACHE_TTL = 300 // 5 minutes

// ----------------------------------------
// GET POTENTIAL MATCHES
// BEFORE: 6 separate queries (likes, passes, blocks, blockedBy, matches, users) = N+1 pattern
//         Offset pagination, no caching, fetches ALL user fields including password/tokens
// AFTER:  Single query for excluded IDs, explicit select (no sensitive fields),
//         cursor-based pagination, Redis cache (5min TTL)
// ----------------------------------------
export const getPotentialMatches = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const {
      limit = '20',
      cursor,             // cursor-based: pass the last user's id
      minCompatibility = '0',
      sortBy = 'compatibility',
      maxDistance,
      nearMeOnly = 'false',
      vibeTags: vibeTagFilter,
    } = req.query

    const limitNum = Math.min(parseInt(limit as string, 10), 50)
    const minCompat = parseInt(minCompatibility as string, 10)
    const sortByOption = sortBy as string
    const isNearMeOnly = nearMeOnly === 'true'
    const maxDistanceKm = maxDistance ? parseInt(maxDistance as string, 10) : null
    const vibeTagIds = vibeTagFilter ? (vibeTagFilter as string).split(',').filter(Boolean) : []
    const cursorId = cursor as string | undefined

    // ── Check Redis cache ──
    const cacheKey = `${CACHE_KEYS.POTENTIAL_MATCHES}${req.userId}:${sortByOption}:${minCompat}:${maxDistanceKm || 'any'}:${vibeTagIds.join(',')}:${cursorId || 'start'}`
    const cached = await getCache<any>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    // ── Single query: get current user with safe fields ──
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { ...SAFE_USER_SELECT, preferences: true },
    })

    if (!currentUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // ── Single query: get ALL excluded user IDs in one shot ──
    // BEFORE: 5 separate queries (likes, passes, blocks, blockedBy, matches)
    // AFTER: parallel Promise.all with select-only queries
    const [likes, passes, blocksGiven, blocksReceived, matches] = await Promise.all([
      prisma.like.findMany({
        where: { likerId: req.userId },
        select: { likedUserId: true },
      }),
      prisma.pass.findMany({
        where: { passerId: req.userId },
        select: { passedUserId: true },
      }),
      prisma.block.findMany({
        where: { blockerId: req.userId },
        select: { blockedUserId: true },
      }),
      prisma.block.findMany({
        where: { blockedUserId: req.userId },
        select: { blockerId: true },
      }),
      prisma.match.findMany({
        where: {
          OR: [{ userId1: req.userId }, { userId2: req.userId }],
        },
        select: { userId1: true, userId2: true },
      }),
    ])

    const excludedUserIds = new Set([
      ...likes.map((l) => l.likedUserId),
      ...passes.map((p) => p.passedUserId),
      ...blocksGiven.map((b) => b.blockedUserId),
      ...blocksReceived.map((b) => b.blockerId),
      ...matches.map((m) => (m.userId1 === req.userId ? m.userId2 : m.userId1)),
      req.userId,
    ])

    // ── Single query: fetch candidate users with nested vibeTags select ──
    // BEFORE: include: { vibeTags: true } — fetches all vibeTag fields + join table
    // AFTER: select with nested select — only the fields we need, no N+1
    const allUsers = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(excludedUserIds) },
      },
      select: {
        ...SAFE_USER_SELECT,
        vibeTags: {
          select: { id: true, label: true, emoji: true, category: true },
        },
      },
    })

    // ── In-memory filter + score (unchanged logic, cleaner types) ──
    const scored = allUsers
      .filter((user) => {
        if (!matchesPreferences(currentUser as any, user as any)) return false
        if (!matchesPreferences(user as any, currentUser as any)) return false

        if (vibeTagIds.length > 0) {
          const tagIds = user.vibeTags.map((t) => t.id)
          if (!vibeTagIds.every((id) => tagIds.includes(id))) return false
        }

        if (maxDistanceKm && currentUser.latitude && currentUser.longitude) {
          if (!user.latitude || !user.longitude) return false
          if (calculateDistance(currentUser.latitude, currentUser.longitude, user.latitude, user.longitude) > maxDistanceKm) return false
        }

        if (isNearMeOnly && currentUser.latitude && currentUser.longitude) {
          if (!user.latitude || !user.longitude) return false
        }

        return true
      })
      .map((user) => {
        const compatibility = calculateCompatibility(currentUser as any, user as any)
        const breakdown = getCompatibilityBreakdown(currentUser as any, user as any)

        let distance: number | null = null
        let distanceText: string | null = null
        if (currentUser.latitude && currentUser.longitude && user.latitude && user.longitude) {
          distance = calculateDistance(currentUser.latitude, currentUser.longitude, user.latitude, user.longitude)
          distanceText = formatDistance(distance)
        }

        return { ...user, compatibility, breakdown, distance, distanceText }
      })
      .filter((u) => u.compatibility >= minCompat)
      .sort((a, b) => {
        if (sortByOption === 'distance') {
          if (a.distance !== null && b.distance === null) return -1
          if (a.distance === null && b.distance !== null) return 1
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance
          return b.compatibility - a.compatibility
        }
        return b.compatibility - a.compatibility
      })

    // ── Cursor-based pagination ──
    // BEFORE: offset-based (skip + take) — degrades at scale
    // AFTER: cursor-based — find the cursor position, slice from there
    let startIndex = 0
    if (cursorId) {
      const cursorIndex = scored.findIndex((u) => u.id === cursorId)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }

    const page = scored.slice(startIndex, startIndex + limitNum)
    const nextCursor = page.length === limitNum ? page[page.length - 1].id : null

    const response = {
      users: page,
      pagination: {
        limit: limitNum,
        total: scored.length,
        nextCursor,
        hasMore: startIndex + limitNum < scored.length,
      },
    }

    // ── Cache result for 5 minutes ──
    await setCache(cacheKey, response, DISCOVERY_CACHE_TTL)

    res.json(response)
  } catch (error) {
    console.error('Get potential matches error:', error)
    res.status(500).json({ message: 'Error fetching potential matches' })
  }
}

/**
 * Invalidate discovery cache for all users.
 * Call this when a new user joins, updates profile, etc.
 */
export const invalidateDiscoveryCache = async () => {
  await deleteCachePattern(`${CACHE_KEYS.POTENTIAL_MATCHES}*`)
}

// ----------------------------------------
// LIKE A USER
// ----------------------------------------
export const likeUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    if (userId === req.userId) {
      res.status(400).json({ message: 'Cannot like yourself' })
      return
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!targetUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: req.userId,
          likedUserId: userId,
        },
      },
    })

    if (existingLike) {
      res.status(400).json({ message: 'Already liked this user' })
      return
    }

    // Create like
    await prisma.like.create({
      data: {
        likerId: req.userId,
        likedUserId: userId,
      },
    })

    // Check if it's a mutual like (match!)
    const mutualLike = await prisma.like.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: userId,
          likedUserId: req.userId,
        },
      },
    })

    let match = null
    if (mutualLike) {
      // Calculate compatibility for the match
      const currentUser = await prisma.user.findUnique({
        where: { id: req.userId },
      })
      const compatibility = currentUser ? calculateCompatibility(currentUser, targetUser) : 50

      // Create match
      match = await prisma.match.create({
        data: {
          userId1: req.userId,
          userId2: userId,
          compatibilityScore: compatibility,
          status: 'accepted',
        },
        include: {
          user1: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              profilePictures: true,
            },
          },
          user2: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              profilePictures: true,
            },
          },
        },
      })
    }

    res.status(201).json({
      message: mutualLike ? "It's a match!" : 'User liked successfully',
      isMatch: !!mutualLike,
      match,
    })
  } catch (error) {
    console.error('Like user error:', error)
    res.status(500).json({ message: 'Error liking user' })
  }
}

// ----------------------------------------
// PASS ON A USER
// ----------------------------------------
export const passUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    if (userId === req.userId) {
      res.status(400).json({ message: 'Cannot pass on yourself' })
      return
    }

    // Check if already passed
    const existingPass = await prisma.pass.findUnique({
      where: {
        passerId_passedUserId: {
          passerId: req.userId,
          passedUserId: userId,
        },
      },
    })

    if (existingPass) {
      res.status(400).json({ message: 'Already passed on this user' })
      return
    }

    // Create pass
    await prisma.pass.create({
      data: {
        passerId: req.userId,
        passedUserId: userId,
      },
    })

    res.status(201).json({ message: 'User passed successfully' })
  } catch (error) {
    console.error('Pass user error:', error)
    res.status(500).json({ message: 'Error passing on user' })
  }
}

// ----------------------------------------
// BLOCK A USER
// ----------------------------------------
export const blockUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    if (userId === req.userId) {
      res.status(400).json({ message: 'Cannot block yourself' })
      return
    }

    // Check if already blocked
    const existingBlock = await prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId: req.userId,
          blockedUserId: userId,
        },
      },
    })

    if (existingBlock) {
      res.status(400).json({ message: 'User already blocked' })
      return
    }

    // Create block
    await prisma.block.create({
      data: {
        blockerId: req.userId,
        blockedUserId: userId,
      },
    })

    // Remove any existing match
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userId1: req.userId, userId2: userId },
          { userId1: userId, userId2: req.userId },
        ],
      },
    })

    res.status(201).json({ message: 'User blocked successfully' })
  } catch (error) {
    console.error('Block user error:', error)
    res.status(500).json({ message: 'Error blocking user' })
  }
}

// ----------------------------------------
// UNDO PASS
// ----------------------------------------
export const undoPass = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    // Delete the pass
    await prisma.pass.delete({
      where: {
        passerId_passedUserId: {
          passerId: req.userId,
          passedUserId: userId,
        },
      },
    })

    res.json({ message: 'Pass undone successfully' })
  } catch (error) {
    console.error('Undo pass error:', error)
    res.status(404).json({ message: 'Pass not found' })
  }
}

// ----------------------------------------
// SEARCH USERS
// ----------------------------------------
export const searchUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const {
      query = '',
      location = '',
      hobbies = '',
      talents = '',
      ageMin,
      ageMax,
      distance,
      gender,
      lookingFor,
      minCompatibility = '0',
      page = '1',
      limit = '20',
    } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const minCompat = parseInt(minCompatibility as string, 10)
    const skip = (pageNum - 1) * limitNum

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
    })

    if (!currentUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Get excluded user IDs (already liked, passed, blocked, matched, self)
    const likes = await prisma.like.findMany({
      where: { likerId: req.userId },
      select: { likedUserId: true },
    })
    const passes = await prisma.pass.findMany({
      where: { passerId: req.userId },
      select: { passedUserId: true },
    })
    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: req.userId }, { blockedUserId: req.userId }] },
      select: { blockerId: true, blockedUserId: true },
    })
    const matches = await prisma.match.findMany({
      where: { OR: [{ userId1: req.userId }, { userId2: req.userId }] },
    })

    const excludedUserIds = [
      ...likes.map((l) => l.likedUserId),
      ...passes.map((p) => p.passedUserId),
      ...blocks.flatMap((b) => [b.blockerId, b.blockedUserId]),
      ...matches.map((m) => (m.userId1 === req.userId ? m.userId2 : m.userId1)),
      req.userId,
    ]

    // Build where clause
    const whereClause: any = {
      id: { notIn: excludedUserIds },
    }

    // Gender filter
    if (gender && gender !== 'any') {
      whereClause.gender = gender
    }

    // Looking for filter
    if (lookingFor) {
      whereClause.lookingFor = lookingFor
    }

    // Fetch all potential users (include vibeTags for display)
    const allUsers = await prisma.user.findMany({
      where: whereClause,
      include: { vibeTags: true },
    })

    // Apply filters
    let filteredUsers = allUsers

    // Username search
    if (query) {
      const searchQuery = (query as string).toLowerCase()
      filteredUsers = filteredUsers.filter((user) => {
        const username = user.username.toLowerCase()
        const firstName = user.firstName.toLowerCase()
        const lastName = user.lastName.toLowerCase()
        return (
          username.includes(searchQuery) ||
          firstName.includes(searchQuery) ||
          lastName.includes(searchQuery)
        )
      })
    }

    // Location search
    if (location) {
      const locationQuery = (location as string).toLowerCase()
      filteredUsers = filteredUsers.filter((user) => {
        if (!user.locationCity && !user.locationCountry) return false
        const city = (user.locationCity || '').toLowerCase()
        const country = (user.locationCountry || '').toLowerCase()
        return city.includes(locationQuery) || country.includes(locationQuery)
      })
    }

    // Hobbies search
    if (hobbies) {
      const hobbiesQuery = (hobbies as string).toLowerCase().split(',')
      filteredUsers = filteredUsers.filter((user) =>
        hobbiesQuery.some((hobby) =>
          user.hobbies.some((h) => h.toLowerCase().includes(hobby.trim()))
        )
      )
    }

    // Talents search
    if (talents) {
      const talentsQuery = (talents as string).toLowerCase().split(',')
      filteredUsers = filteredUsers.filter((user) =>
        talentsQuery.some((talent) =>
          user.talents.some((t) => t.toLowerCase().includes(talent.trim()))
        )
      )
    }

    // Age range filter
    if (ageMin || ageMax) {
      const today = new Date()
      filteredUsers = filteredUsers.filter((user) => {
        const birthDate = new Date(user.dateOfBirth)
        let age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--
        }
        if (ageMin && age < parseInt(ageMin as string)) return false
        if (ageMax && age > parseInt(ageMax as string)) return false
        return true
      })
    }

    // Distance filter
    if (distance && currentUser.latitude && currentUser.longitude) {
      const maxDistance = parseInt(distance as string)
      filteredUsers = filteredUsers.filter((user) => {
        if (!user.latitude || !user.longitude) return false
        const dist = calculateDistance(
          currentUser.latitude!,
          currentUser.longitude!,
          user.latitude,
          user.longitude
        )
        return dist <= maxDistance
      })
    }

    // Calculate compatibility, distance, and filter
    const usersWithCompatibility = filteredUsers
      .map((user) => {
        const compatibility = calculateCompatibility(currentUser, user)
        const breakdown = getCompatibilityBreakdown(currentUser, user)

        // Calculate distance if both users have location data
        let distanceKm = null
        let distanceText = null
        if (currentUser.latitude && currentUser.longitude && user.latitude && user.longitude) {
          distanceKm = calculateDistance(
            currentUser.latitude,
            currentUser.longitude,
            user.latitude,
            user.longitude
          )
          distanceText = formatDistance(distanceKm)
        }

        return {
          ...user,
          compatibility,
          breakdown,
          distance: distanceKm,
          distanceText,
        }
      })
      .filter((user) => user.compatibility >= minCompat)
      .sort((a, b) => b.compatibility - a.compatibility)

    // Paginate
    const paginatedUsers = usersWithCompatibility.slice(skip, skip + limitNum)

    // Remove sensitive data
    const sanitizedUsers = paginatedUsers.map((user) => {
      const {
        password,
        refreshToken,
        resetPasswordToken,
        emailVerificationToken,
        phoneVerificationToken,
        ...safeUser
      } = user
      return safeUser
    })

    res.json({
      users: sanitizedUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: usersWithCompatibility.length,
        totalPages: Math.ceil(usersWithCompatibility.length / limitNum),
        hasMore: skip + limitNum < usersWithCompatibility.length,
      },
    })
  } catch (error) {
    console.error('Search users error:', error)
    res.status(500).json({ message: 'Error searching users' })
  }
}

// ----------------------------------------
// UNBLOCK A USER
// ----------------------------------------
export const unblockUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    // Check if block exists
    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId: req.userId,
          blockedUserId: userId,
        },
      },
    })

    if (!block) {
      res.status(404).json({ message: 'User is not blocked' })
      return
    }

    // Delete the block
    await prisma.block.delete({
      where: {
        blockerId_blockedUserId: {
          blockerId: req.userId,
          blockedUserId: userId,
        },
      },
    })

    res.json({ message: 'User unblocked successfully' })
  } catch (error) {
    console.error('Unblock user error:', error)
    res.status(500).json({ message: 'Error unblocking user' })
  }
}

// ----------------------------------------
// GET BLOCKED USERS
// ----------------------------------------
export const getBlockedUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const blocks = await prisma.block.findMany({
      where: {
        blockerId: req.userId,
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    })

    const blockedUsers = blocks.map((block) => ({
      ...block.blockedUser,
      blockedAt: block.createdAt,
    }))

    res.json({ blockedUsers })
  } catch (error) {
    console.error('Get blocked users error:', error)
    res.status(500).json({ message: 'Error fetching blocked users' })
  }
}

// ----------------------------------------
// GET LIKED USERS
// ----------------------------------------
export const getLikedUsers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // Get current user for compatibility calculation
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
    })

    if (!currentUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Get all users current user has liked
    const likes = await prisma.like.findMany({
      where: { likerId: req.userId },
      include: {
        likedUser: true,
      },
      orderBy: {
        createdAt: 'desc', // Most recent likes first
      },
    })

    // Get all matches to identify mutual likes
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { userId1: req.userId },
          { userId2: req.userId },
        ],
      },
    })

    const matchedUserIds = new Set(
      matches.map((match) =>
        match.userId1 === req.userId ? match.userId2 : match.userId1
      )
    )

    // Map liked users with match status, compatibility, and distance
    const likedUsersWithStatus = likes.map((like) => {
      const {
        password,
        refreshToken,
        resetPasswordToken,
        emailVerificationToken,
        phoneVerificationToken,
        ...safeUser
      } = like.likedUser
      const isMatch = matchedUserIds.has(like.likedUserId)
      const compatibility = calculateCompatibility(currentUser, like.likedUser)
      const breakdown = getCompatibilityBreakdown(currentUser, like.likedUser)

      // Calculate distance if both users have location data
      let distance = null
      let distanceText = null
      if (currentUser.latitude && currentUser.longitude && like.likedUser.latitude && like.likedUser.longitude) {
        distance = calculateDistance(
          currentUser.latitude,
          currentUser.longitude,
          like.likedUser.latitude,
          like.likedUser.longitude
        )
        distanceText = formatDistance(distance)
      }

      return {
        ...safeUser,
        isMatch,
        compatibility,
        breakdown,
        likedAt: like.createdAt,
        distance,
        distanceText,
      }
    })

    res.json({
      likedUsers: likedUsersWithStatus,
      total: likedUsersWithStatus.length,
      matchesCount: likedUsersWithStatus.filter((u) => u.isMatch).length,
    })
  } catch (error) {
    console.error('Get liked users error:', error)
    res.status(500).json({ message: 'Error fetching liked users' })
  }
}
