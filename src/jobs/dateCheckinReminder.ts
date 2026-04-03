import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'
import { getSocketIO } from '../socket/socket'

/**
 * Check for date check-ins that are overdue (scheduledAt + 2 hours past, no response).
 * - First pass: send initial reminder, set reminderSentAt
 * - Second pass (15 min later): if still no response, mark as MISSED
 *
 * Runs every minute via setInterval.
 */
export const processDateCheckinReminders = async (): Promise<void> => {
  try {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000)

    // 1. Find PENDING check-ins where scheduledAt + 2h has passed AND no reminder sent yet
    const needsFirstReminder = await prisma.dateCheckin.findMany({
      where: {
        status: 'PENDING',
        respondedAt: null,
        reminderSentAt: null,
        scheduledAt: { lte: twoHoursAgo },
      },
      include: {
        user: { select: { id: true, firstName: true } },
      },
    })

    const io = getSocketIO()

    for (const checkin of needsFirstReminder) {
      // Send push notification via socket (in-app notification)
      if (io) {
        io.emit(`notification:${checkin.userId}`, {
          type: 'safety_checkin',
          title: 'Are you safe?',
          body: 'Hey, are you safe? Tap to let us know \uD83D\uDC9A',
          checkinId: checkin.id,
        })
      }

      await prisma.dateCheckin.update({
        where: { id: checkin.id },
        data: { reminderSentAt: now },
      })

      logInfo('Date check-in reminder sent', { checkinId: checkin.id, userId: checkin.userId })
    }

    // 2. Find PENDING check-ins where reminder was sent 15+ min ago and still no response → mark MISSED
    const needsMissed = await prisma.dateCheckin.findMany({
      where: {
        status: 'PENDING',
        respondedAt: null,
        reminderSentAt: { not: null, lte: fifteenMinAgo },
      },
      include: {
        user: { select: { id: true, firstName: true, emergencyContactPhone: true, emergencyContactName: true } },
      },
    })

    for (const checkin of needsMissed) {
      await prisma.dateCheckin.update({
        where: { id: checkin.id },
        data: { status: 'MISSED' },
      })

      // Send second urgent notification
      if (io) {
        io.emit(`notification:${checkin.userId}`, {
          type: 'safety_checkin_missed',
          title: 'Check-in missed',
          body: 'You didn\'t check in. We hope you\'re okay. If you need help, use the SOS button.',
          checkinId: checkin.id,
        })
      }

      logInfo('Date check-in marked as MISSED', { checkinId: checkin.id, userId: checkin.userId })
    }
  } catch (error) {
    logError('Error processing date check-in reminders', error as Error)
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export const startDateCheckinJob = () => {
  // Run every minute
  intervalId = setInterval(processDateCheckinReminders, 60 * 1000)
  logInfo('Date check-in reminder job started (every minute)')
}

export const stopDateCheckinJob = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logInfo('Date check-in reminder job stopped')
  }
}
