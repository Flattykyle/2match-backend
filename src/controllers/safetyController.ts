import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'

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
