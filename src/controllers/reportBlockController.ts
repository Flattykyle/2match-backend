import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'

const VALID_REASONS = [
  'INAPPROPRIATE_PHOTOS',
  'HARASSMENT',
  'FAKE_PROFILE',
  'UNSAFE_BEHAVIOR',
  'HATE_SPEECH',
  'OTHER',
]

const AUTO_FLAG_THRESHOLD = 3
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

// ----------------------------------------
// REPORT A USER
// POST /api/users/:userId/report
// ----------------------------------------
export const reportUserNew = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId: reportedUserId } = req.params
    const { reason, optionalNote } = req.body

    if (!reason || !VALID_REASONS.includes(reason)) {
      res.status(400).json({ message: `reason must be one of: ${VALID_REASONS.join(', ')}` })
      return
    }

    if (reportedUserId === req.userId) {
      res.status(400).json({ message: 'Cannot report yourself' })
      return
    }

    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedUserId },
      select: { id: true, firstName: true, flagged: true },
    })

    if (!reportedUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Check for duplicate report from same user
    const existingReport = await prisma.report.findFirst({
      where: { reporterId: req.userId, reportedUserId },
    })

    if (existingReport) {
      res.status(400).json({ message: 'You have already reported this user' })
      return
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        reporterId: req.userId,
        reportedUserId,
        reason,
        description: optionalNote?.trim() || null,
        status: 'pending',
      },
    })

    // Auto-flag check: count distinct reporters for this user
    const distinctReporterCount = await prisma.report.groupBy({
      by: ['reporterId'],
      where: { reportedUserId },
    })

    if (distinctReporterCount.length >= AUTO_FLAG_THRESHOLD && !reportedUser.flagged) {
      await prisma.user.update({
        where: { id: reportedUserId },
        data: { flagged: true },
      })

      logInfo('User auto-flagged', { reportedUserId, reportCount: distinctReporterCount.length })

      // Send admin email via nodemailer (if configured)
      sendAdminFlagEmail(reportedUserId, distinctReporterCount.length).catch((err) =>
        logError('Failed to send admin flag email', err)
      )
    }

    logInfo('Report created', { reportId: report.id, reporterId: req.userId, reportedUserId, reason })

    res.status(201).json({ reportId: report.id })
  } catch (error) {
    console.error('Report user error:', error)
    res.status(500).json({ message: 'Error reporting user' })
  }
}

// ----------------------------------------
// BLOCK A USER
// POST /api/users/:userId/block
// ----------------------------------------
export const blockUserNew = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId: blockedUserId } = req.params

    if (blockedUserId === req.userId) {
      res.status(400).json({ message: 'Cannot block yourself' })
      return
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: blockedUserId },
      select: { id: true },
    })

    if (!targetUser) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Upsert block (idempotent)
    await prisma.block.upsert({
      where: {
        blockerId_blockedUserId: { blockerId: req.userId, blockedUserId },
      },
      update: {},
      create: { blockerId: req.userId, blockedUserId },
    })

    // Remove any existing match between the two users
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userId1: req.userId, userId2: blockedUserId },
          { userId1: blockedUserId, userId2: req.userId },
        ],
      },
    })

    // Archive conversations between the two users (don't delete — keep for moderation)
    await prisma.conversation.updateMany({
      where: {
        OR: [
          { user1Id: req.userId, user2Id: blockedUserId },
          { user1Id: blockedUserId, user2Id: req.userId },
        ],
      },
      data: { archived: true },
    })

    // Remove likes in both directions
    await prisma.like.deleteMany({
      where: {
        OR: [
          { likerId: req.userId, likedUserId: blockedUserId },
          { likerId: blockedUserId, likedUserId: req.userId },
        ],
      },
    })

    logInfo('User blocked', { blockerId: req.userId, blockedUserId })

    res.json({ message: 'User blocked' })
  } catch (error) {
    console.error('Block user error:', error)
    res.status(500).json({ message: 'Error blocking user' })
  }
}

// ----------------------------------------
// Admin email helper
// ----------------------------------------
async function sendAdminFlagEmail(reportedUserId: string, reportCount: number): Promise<void> {
  if (!ADMIN_EMAIL) {
    logInfo('Admin email not configured, skipping flag notification', { reportedUserId })
    return
  }

  try {
    const nodemailer = require('nodemailer') as typeof import('nodemailer')

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const user = await prisma.user.findUnique({
      where: { id: reportedUserId },
      select: { firstName: true, lastName: true, username: true, email: true },
    })

    await transporter.sendMail({
      from: process.env.SMTP_FROM || '2-Match Safety <safety@2match.app>',
      to: ADMIN_EMAIL,
      subject: `[2-Match] User auto-flagged: ${user?.username || reportedUserId}`,
      html: `
        <h2>User Auto-Flagged</h2>
        <p><strong>${user?.firstName} ${user?.lastName}</strong> (@${user?.username}) has been reported by <strong>${reportCount}</strong> distinct users and has been auto-flagged.</p>
        <p>Please review this user's profile and reports in the admin dashboard.</p>
        <p>User ID: <code>${reportedUserId}</code></p>
      `,
    })

    logInfo('Admin flag email sent', { reportedUserId, to: ADMIN_EMAIL })
  } catch (error) {
    logError('Failed to send admin email', error as Error)
  }
}
