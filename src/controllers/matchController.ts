import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

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
