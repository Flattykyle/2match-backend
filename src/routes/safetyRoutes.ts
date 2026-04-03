import { Router } from 'express'
import {
  getSafetySettings,
  updateSafetySettings,
  triggerSOS,
  createDateCheckin,
  respondToDateCheckin,
  getDateCheckins,
  createMoodCheckin,
  snoozeProfile,
} from '../controllers/safetyController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/settings', getSafetySettings)
router.put('/settings', updateSafetySettings)
router.post('/sos', triggerSOS)

// Date check-in routes
router.post('/date-checkin', createDateCheckin)
router.post('/date-checkin/:checkinId/respond', respondToDateCheckin)
router.get('/date-checkins', getDateCheckins)

// Mood check-in
router.post('/mood-checkin', createMoodCheckin)

// Snooze profile
router.post('/snooze-profile', snoozeProfile)

export default router
