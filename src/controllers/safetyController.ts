import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'
import { getSocketIO } from '../socket/socket'

// ----------------------------------------
// GET SAFETY SETTINGS
// GET /api/safety/settings
// ----------------------------------------
export const getSafetySettings = async (
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
      select: {
        slowModeEnabled: true,
        slowModeLimit: true,
        activeHoursStart: true,
        activeHoursEnd: true,
        photoShieldEnabled: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json(user)
  } catch (error) {
    console.error('Get safety settings error:', error)
    res.status(500).json({ message: 'Error fetching safety settings' })
  }
}

// ----------------------------------------
// UPDATE SAFETY SETTINGS
// PUT /api/safety/settings
// ----------------------------------------
export const updateSafetySettings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const {
      slowModeEnabled,
      slowModeLimit,
      activeHoursStart,
      activeHoursEnd,
      photoShieldEnabled,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body

    // Validate slowModeLimit range
    if (slowModeLimit !== undefined && (slowModeLimit < 1 || slowModeLimit > 10)) {
      res.status(400).json({ message: 'slowModeLimit must be between 1 and 10' })
      return
    }

    // Validate activeHours range
    if (activeHoursStart !== undefined && activeHoursStart !== null) {
      if (activeHoursStart < 0 || activeHoursStart > 23) {
        res.status(400).json({ message: 'activeHoursStart must be between 0 and 23' })
        return
      }
    }
    if (activeHoursEnd !== undefined && activeHoursEnd !== null) {
      if (activeHoursEnd < 0 || activeHoursEnd > 23) {
        res.status(400).json({ message: 'activeHoursEnd must be between 0 and 23' })
        return
      }
    }

    const data: any = {}
    if (slowModeEnabled !== undefined) data.slowModeEnabled = Boolean(slowModeEnabled)
    if (slowModeLimit !== undefined) data.slowModeLimit = Number(slowModeLimit)
    if (activeHoursStart !== undefined) data.activeHoursStart = activeHoursStart === null ? null : Number(activeHoursStart)
    if (activeHoursEnd !== undefined) data.activeHoursEnd = activeHoursEnd === null ? null : Number(activeHoursEnd)
    if (photoShieldEnabled !== undefined) data.photoShieldEnabled = Boolean(photoShieldEnabled)
    if (emergencyContactName !== undefined) data.emergencyContactName = emergencyContactName || null
    if (emergencyContactPhone !== undefined) data.emergencyContactPhone = emergencyContactPhone || null

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: {
        slowModeEnabled: true,
        slowModeLimit: true,
        activeHoursStart: true,
        activeHoursEnd: true,
        photoShieldEnabled: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
      },
    })

    res.json({ message: 'Safety settings updated', ...updated })
  } catch (error) {
    console.error('Update safety settings error:', error)
    res.status(500).json({ message: 'Error updating safety settings' })
  }
}

// ----------------------------------------
// SOS — Emergency alert
// POST /api/safety/sos
// ----------------------------------------
export const triggerSOS = async (
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
      select: {
        firstName: true,
        lastName: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        latitude: true,
        longitude: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (!user.emergencyContactPhone) {
      res.status(400).json({ message: 'No emergency contact phone number configured' })
      return
    }

    // Record SOS event
    const sosEvent = await prisma.sosEvent.create({
      data: {
        userId: req.userId,
        latitude: user.latitude,
        longitude: user.longitude,
        notifiedContact: user.emergencyContactPhone,
      },
    })

    // Build the SOS message
    const locationUrl = user.latitude && user.longitude
      ? `https://maps.google.com/?q=${user.latitude},${user.longitude}`
      : 'Location unavailable'

    const smsBody = `SOS from 2Match: ${user.firstName} ${user.lastName} triggered an emergency alert. Location: ${locationUrl}`

    // Attempt to send SMS via Twilio (if configured)
    let smsSent = false
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        // Dynamic require to avoid hard dependency — twilio is optional
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const twilioModule = require('twilio') as any
        const client = twilioModule(twilioSid, twilioToken)

        await client.messages.create({
          body: smsBody,
          from: twilioFrom,
          to: user.emergencyContactPhone,
        })

        smsSent = true
        logInfo('SOS SMS sent', { userId: req.userId, contact: user.emergencyContactPhone })
      } catch (smsError) {
        logError('SOS SMS failed', smsError as Error)
      }
    } else {
      // Log the SOS if Twilio not configured
      logInfo('SOS triggered (Twilio not configured)', {
        userId: req.userId,
        contact: user.emergencyContactPhone,
        message: smsBody,
      })
    }

    res.json({
      message: smsSent
        ? `SOS sent to ${user.emergencyContactName || 'your emergency contact'}`
        : 'SOS recorded. SMS notification could not be sent (Twilio not configured).',
      sosEventId: sosEvent.id,
      smsSent,
    })
  } catch (error) {
    console.error('SOS trigger error:', error)
    res.status(500).json({ message: 'Error triggering SOS' })
  }
}

// ----------------------------------------
// CREATE DATE CHECK-IN
// POST /api/safety/date-checkin
// ----------------------------------------
export const createDateCheckin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { matchId, scheduledFor, trustedContactEmail } = req.body

    if (!scheduledFor) {
      res.status(400).json({ message: 'scheduledFor is required' })
      return
    }

    const scheduledAt = new Date(scheduledFor)
    if (isNaN(scheduledAt.getTime())) {
      res.status(400).json({ message: 'Invalid date format for scheduledFor' })
      return
    }

    // Validate match ownership if matchId is provided
    if (matchId) {
      const match = await prisma.match.findFirst({
        where: {
          id: matchId,
          OR: [{ userId1: req.userId }, { userId2: req.userId }],
        },
      })
      if (!match) {
        res.status(404).json({ message: 'Match not found' })
        return
      }
    }

    const checkin = await prisma.dateCheckin.create({
      data: {
        userId: req.userId,
        matchId: matchId || null,
        scheduledAt,
        trustedContactEmail: trustedContactEmail || null,
      },
    })

    logInfo('Date check-in created', { checkinId: checkin.id, userId: req.userId, scheduledAt })

    res.status(201).json(checkin)
  } catch (error) {
    console.error('Create date check-in error:', error)
    res.status(500).json({ message: 'Error creating date check-in' })
  }
}

// ----------------------------------------
// RESPOND TO DATE CHECK-IN
// POST /api/safety/date-checkin/:checkinId/respond
// ----------------------------------------
export const respondToDateCheckin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { checkinId } = req.params
    const { status } = req.body

    if (status !== 'SAFE') {
      res.status(400).json({ message: 'Status must be SAFE' })
      return
    }

    const checkin = await prisma.dateCheckin.findFirst({
      where: { id: checkinId, userId: req.userId },
      include: {
        user: { select: { id: true, firstName: true } },
        match: { select: { id: true, userId1: true, userId2: true } },
      },
    })

    if (!checkin) {
      res.status(404).json({ message: 'Check-in not found' })
      return
    }

    if (checkin.respondedAt) {
      res.status(400).json({ message: 'Already responded to this check-in' })
      return
    }

    const updated = await prisma.dateCheckin.update({
      where: { id: checkinId },
      data: {
        respondedAt: new Date(),
        status: 'SAFE',
      },
    })

    // Emit 'safety:confirmed' to match partner
    if (checkin.match) {
      const io = getSocketIO()
      if (io) {
        io.to(`match:${checkin.match.id}`).emit('safety:confirmed', {
          userId: req.userId,
          firstName: checkin.user.firstName,
          checkinId: checkin.id,
          matchId: checkin.match.id,
        })
      }
    }

    logInfo('Date check-in responded SAFE', { checkinId, userId: req.userId })

    res.json(updated)
  } catch (error) {
    console.error('Respond to date check-in error:', error)
    res.status(500).json({ message: 'Error responding to check-in' })
  }
}

// ----------------------------------------
// GET DATE CHECK-INS
// GET /api/safety/date-checkins
// ----------------------------------------
export const getDateCheckins = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const checkins = await prisma.dateCheckin.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        match: {
          select: {
            id: true,
            user1: { select: { id: true, firstName: true } },
            user2: { select: { id: true, firstName: true } },
          },
        },
      },
    })

    res.json(checkins)
  } catch (error) {
    console.error('Get date check-ins error:', error)
    res.status(500).json({ message: 'Error fetching check-ins' })
  }
}

// ----------------------------------------
// CREATE MOOD CHECK-IN
// POST /api/safety/mood-checkin
// ----------------------------------------
export const createMoodCheckin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { mood, note } = req.body

    const validMoods = ['GREAT', 'GOOD', 'OKAY', 'BURNED_OUT', 'TAKING_BREAK']
    if (!mood || !validMoods.includes(mood)) {
      res.status(400).json({ message: `mood must be one of: ${validMoods.join(', ')}` })
      return
    }

    const checkin = await prisma.moodCheckin.create({
      data: {
        userId: req.userId,
        mood,
        note: note || null,
      },
    })

    const response: any = { checkin }

    if (mood === 'BURNED_OUT' || mood === 'TAKING_BREAK') {
      response.suggestion = 'You deserve a break. Snooze your profile for 3 days?'
    }

    res.status(201).json(response)
  } catch (error) {
    console.error('Create mood check-in error:', error)
    res.status(500).json({ message: 'Error creating mood check-in' })
  }
}

// ----------------------------------------
// SNOOZE PROFILE
// POST /api/safety/snooze-profile
// ----------------------------------------
export const snoozeProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { days } = req.body

    if (!days || typeof days !== 'number' || days < 1 || days > 30) {
      res.status(400).json({ message: 'days must be a number between 1 and 30' })
      return
    }

    const snoozedUntil = new Date()
    snoozedUntil.setDate(snoozedUntil.getDate() + days)

    await prisma.user.update({
      where: { id: req.userId },
      data: { snoozedUntil },
    })

    logInfo('Profile snoozed', { userId: req.userId, days, snoozedUntil })

    res.json({ message: `Profile snoozed for ${days} days`, snoozedUntil })
  } catch (error) {
    console.error('Snooze profile error:', error)
    res.status(500).json({ message: 'Error snoozing profile' })
  }
}
