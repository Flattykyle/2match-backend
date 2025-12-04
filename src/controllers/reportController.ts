import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// ----------------------------------------
// REPORT A USER
// ----------------------------------------
export const reportUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId, reason, description } = req.body

    if (!userId || !reason) {
      res.status(400).json({ message: 'User ID and reason are required' })
      return
    }

    // Validate reason
    const validReasons = [
      'inappropriate_content',
      'fake_profile',
      'harassment',
      'spam',
      'other',
    ]

    if (!validReasons.includes(reason)) {
      res.status(400).json({ message: 'Invalid reason' })
      return
    }

    if (userId === req.userId) {
      res.status(400).json({ message: 'Cannot report yourself' })
      return
    }

    // Check if user exists
    const reportedUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!reportedUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        reporterId: req.userId,
        reportedUserId: userId,
        reason,
        description: description || null,
        status: 'pending',
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    res.status(201).json({
      message: 'Report submitted successfully',
      report,
    })
  } catch (error) {
    console.error('Report user error:', error)
    res.status(500).json({ message: 'Error reporting user' })
  }
}

// ----------------------------------------
// GET USER'S SUBMITTED REPORTS
// ----------------------------------------
export const getMyReports = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const reports = await prisma.report.findMany({
      where: {
        reporterId: req.userId,
      },
      include: {
        reportedUser: {
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

    res.json({ reports })
  } catch (error) {
    console.error('Get my reports error:', error)
    res.status(500).json({ message: 'Error fetching reports' })
  }
}

// ----------------------------------------
// GET ALL REPORTS (ADMIN ONLY)
// ----------------------------------------
export const getAllReports = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // TODO: Add admin check here
    // For now, allowing all authenticated users to view (update in production)

    const { status, page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const whereClause: any = {}

    if (status && status !== 'all') {
      whereClause.status = status
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where: whereClause,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          reportedUser: {
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
        skip,
        take: limitNum,
      }),
      prisma.report.count({ where: whereClause }),
    ])

    res.json({
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get all reports error:', error)
    res.status(500).json({ message: 'Error fetching reports' })
  }
}

// ----------------------------------------
// UPDATE REPORT STATUS (ADMIN ONLY)
// ----------------------------------------
export const updateReportStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // TODO: Add admin check here

    const { reportId } = req.params
    const { status, actionTaken } = req.body

    if (!status) {
      res.status(400).json({ message: 'Status is required' })
      return
    }

    const validStatuses = ['pending', 'reviewed', 'action_taken', 'dismissed']
    if (!validStatuses.includes(status)) {
      res.status(400).json({ message: 'Invalid status' })
      return
    }

    const validActions = ['warning', 'suspension', 'ban', 'none', null]
    if (actionTaken && !validActions.includes(actionTaken)) {
      res.status(400).json({ message: 'Invalid action' })
      return
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        actionTaken: actionTaken || null,
        reviewedBy: req.userId,
        reviewedAt: new Date(),
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    })

    res.json({
      message: 'Report updated successfully',
      report,
    })
  } catch (error) {
    console.error('Update report status error:', error)
    res.status(500).json({ message: 'Error updating report' })
  }
}

// ----------------------------------------
// DELETE REPORT
// ----------------------------------------
export const deleteReport = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { reportId } = req.params

    // Check if report exists and belongs to user
    const report = await prisma.report.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      res.status(404).json({ message: 'Report not found' })
      return
    }

    if (report.reporterId !== req.userId) {
      res.status(403).json({ message: 'Not authorized to delete this report' })
      return
    }

    await prisma.report.delete({
      where: { id: reportId },
    })

    res.json({ message: 'Report deleted successfully' })
  } catch (error) {
    console.error('Delete report error:', error)
    res.status(500).json({ message: 'Error deleting report' })
  }
}
