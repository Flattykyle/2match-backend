import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// ----------------------------------------
// TRACK PROFILE VIEW
// ----------------------------------------
export const trackProfileView = async (
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
      // Don't track views of own profile
      res.status(200).json({ message: 'Own profile view not tracked' })
      return
    }

    // Check if user exists
    const viewedUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!viewedUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Check if already viewed recently (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentView = await prisma.profileView.findFirst({
      where: {
        viewerId: req.userId,
        viewedUserId: userId,
        viewedAt: {
          gte: oneHourAgo,
        },
      },
    })

    if (recentView) {
      // Update the timestamp of the existing view
      await prisma.profileView.update({
        where: { id: recentView.id },
        data: { viewedAt: new Date() },
      })

      res.json({
        message: 'Profile view updated',
        isNewView: false,
      })
      return
    }

    // Create new profile view
    await prisma.profileView.create({
      data: {
        viewerId: req.userId,
        viewedUserId: userId,
      },
    })

    res.status(201).json({
      message: 'Profile view tracked',
      isNewView: true,
    })
  } catch (error) {
    console.error('Track profile view error:', error)
    res.status(500).json({ message: 'Error tracking profile view' })
  }
}

// ----------------------------------------
// GET WHO VIEWED MY PROFILE
// ----------------------------------------
export const getProfileViewers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    // Get profile views
    const views = await prisma.profileView.findMany({
      where: {
        viewedUserId: req.userId,
      },
      include: {
        viewer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            bio: true,
            locationCity: true,
            locationCountry: true,
            emailVerified: true,
            phoneVerified: true,
            photoVerified: true,
          },
        },
      },
      orderBy: {
        viewedAt: 'desc',
      },
      skip,
      take: limitNum,
    })

    // Get total count
    const total = await prisma.profileView.count({
      where: {
        viewedUserId: req.userId,
      },
    })

    // Check for mutual views
    const viewerIds = views.map((v) => v.viewerId)
    const mutualViews = await prisma.profileView.findMany({
      where: {
        viewerId: req.userId,
        viewedUserId: {
          in: viewerIds,
        },
      },
    })

    const mutualViewSet = new Set(mutualViews.map((v) => v.viewedUserId))

    // Map views with mutual status
    const viewsWithMutualStatus = views.map((view) => ({
      ...view.viewer,
      viewedAt: view.viewedAt,
      isMutual: mutualViewSet.has(view.viewerId),
    }))

    res.json({
      viewers: viewsWithMutualStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get profile viewers error:', error)
    res.status(500).json({ message: 'Error fetching profile viewers' })
  }
}

// ----------------------------------------
// GET PROFILES I VIEWED
// ----------------------------------------
export const getViewedProfiles = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const views = await prisma.profileView.findMany({
      where: {
        viewerId: req.userId,
      },
      include: {
        viewedUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            bio: true,
            locationCity: true,
            locationCountry: true,
            emailVerified: true,
            phoneVerified: true,
            photoVerified: true,
          },
        },
      },
      orderBy: {
        viewedAt: 'desc',
      },
      skip,
      take: limitNum,
    })

    const total = await prisma.profileView.count({
      where: {
        viewerId: req.userId,
      },
    })

    const viewedProfiles = views.map((view) => ({
      ...view.viewedUser,
      viewedAt: view.viewedAt,
    }))

    res.json({
      profiles: viewedProfiles,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get viewed profiles error:', error)
    res.status(500).json({ message: 'Error fetching viewed profiles' })
  }
}

// ----------------------------------------
// GET PROFILE VIEW STATS
// ----------------------------------------
export const getProfileViewStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // Count total views received
    const totalViews = await prisma.profileView.count({
      where: {
        viewedUserId: req.userId,
      },
    })

    // Count unique viewers
    const uniqueViewers = await prisma.profileView.findMany({
      where: {
        viewedUserId: req.userId,
      },
      distinct: ['viewerId'],
      select: {
        viewerId: true,
      },
    })

    // Count views in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentViews = await prisma.profileView.count({
      where: {
        viewedUserId: req.userId,
        viewedAt: {
          gte: sevenDaysAgo,
        },
      },
    })

    // Get viewer IDs to check for mutual views
    const viewerIds = uniqueViewers.map((v) => v.viewerId)
    const mutualViews = await prisma.profileView.count({
      where: {
        viewerId: req.userId,
        viewedUserId: {
          in: viewerIds,
        },
      },
    })

    res.json({
      totalViews,
      uniqueViewers: uniqueViewers.length,
      recentViews,
      mutualViews,
    })
  } catch (error) {
    console.error('Get profile view stats error:', error)
    res.status(500).json({ message: 'Error fetching profile view stats' })
  }
}
