import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { calculateCompatibility, getCompatibilityBreakdown, matchesPreferences } from '../utils/compatibility'
import { calculateDistance, formatDistance } from '../utils/location'

// ----------------------------------------
// GET POTENTIAL MATCHES
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
      page = '1',
      limit = '20',
      minCompatibility = '0',
      sortBy = 'compatibility',
      maxDistance,
      nearMeOnly = 'false',
    } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const minCompat = parseInt(minCompatibility as string, 10)
    const skip = (pageNum - 1) * limitNum
    const sortByOption = sortBy as string
    const isNearMeOnly = nearMeOnly === 'true'
    const maxDistanceKm = maxDistance ? parseInt(maxDistance as string, 10) : null

    // Get current user with all data
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
    })

    if (!currentUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Get users that current user has already liked
    const likes = await prisma.like.findMany({
      where: { likerId: req.userId },
      select: { likedUserId: true },
    })
    const likedUserIds = likes.map((like) => like.likedUserId)

    // Get users that current user has already passed
    const passes = await prisma.pass.findMany({
      where: { passerId: req.userId },
      select: { passedUserId: true },
    })
    const passedUserIds = passes.map((pass) => pass.passedUserId)

    // Get users that current user has blocked
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.userId },
      select: { blockedUserId: true },
    })
    const blockedUserIds = blocks.map((block) => block.blockedUserId)

    // Get users that have blocked current user
    const blockedBy = await prisma.block.findMany({
      where: { blockedUserId: req.userId },
      select: { blockerId: true },
    })
    const blockedByUserIds = blockedBy.map((block) => block.blockerId)

    // Get existing matches
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { userId1: req.userId },
          { userId2: req.userId },
        ],
      },
    })
    const matchedUserIds = matches.map((match) =>
      match.userId1 === req.userId ? match.userId2 : match.userId1
    )

    // Combine all excluded IDs
    const excludedUserIds = [
      ...likedUserIds,
      ...passedUserIds,
      ...blockedUserIds,
      ...blockedByUserIds,
      ...matchedUserIds,
      req.userId, // Exclude self
    ]

    // Get all potential matches
    const allUsers = await prisma.user.findMany({
      where: {
        id: {
          notIn: excludedUserIds,
        },
      },
    })

    // Filter by preferences and calculate compatibility & distance
    const usersWithCompatibility = allUsers
      .filter((user) => {
        // Check if current user matches target user's preferences
        if (!matchesPreferences(currentUser, user)) return false
        // Check if target user matches current user's preferences
        if (!matchesPreferences(user, currentUser)) return false

        // Filter by distance if requested
        if (maxDistanceKm && currentUser.latitude && currentUser.longitude) {
          if (!user.latitude || !user.longitude) return false
          const distance = calculateDistance(
            currentUser.latitude,
            currentUser.longitude,
            user.latitude,
            user.longitude
          )
          if (distance > maxDistanceKm) return false
        }

        // Near me only filter (users with location data within reasonable distance)
        if (isNearMeOnly && currentUser.latitude && currentUser.longitude) {
          if (!user.latitude || !user.longitude) return false
        }

        return true
      })
      .map((user) => {
        const compatibility = calculateCompatibility(currentUser, user)
        const breakdown = getCompatibilityBreakdown(currentUser, user)

        // Calculate distance if both users have location data
        let distance = null
        let distanceText = null
        if (currentUser.latitude && currentUser.longitude && user.latitude && user.longitude) {
          distance = calculateDistance(
            currentUser.latitude,
            currentUser.longitude,
            user.latitude,
            user.longitude
          )
          distanceText = formatDistance(distance)
        }

        return {
          ...user,
          compatibility,
          breakdown,
          distance,
          distanceText,
        }
      })
      .filter((user) => user.compatibility >= minCompat)
      .sort((a, b) => {
        // Sort by distance or compatibility
        if (sortByOption === 'distance') {
          // Users with distance come first, sorted by distance
          if (a.distance !== null && b.distance === null) return -1
          if (a.distance === null && b.distance !== null) return 1
          if (a.distance !== null && b.distance !== null) return a.distance - b.distance
          // If both null, fall back to compatibility
          return b.compatibility - a.compatibility
        } else {
          // Default: sort by compatibility
          return b.compatibility - a.compatibility
        }
      })

    // Paginate results
    const paginatedUsers = usersWithCompatibility.slice(skip, skip + limitNum)

    // Remove password and sensitive data from results
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
    console.error('Get potential matches error:', error)
    res.status(500).json({ message: 'Error fetching potential matches' })
  }
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

    // Fetch all potential users
    const allUsers = await prisma.user.findMany({
      where: whereClause,
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
