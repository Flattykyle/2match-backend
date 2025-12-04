import { Router } from 'express'
import {
  trackProfileView,
  getProfileViewers,
  getViewedProfiles,
  getProfileViewStats,
} from '../controllers/profileViewController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Track a profile view
router.post('/:userId', trackProfileView)

// Get who viewed my profile
router.get('/viewers', getProfileViewers)

// Get profiles I viewed
router.get('/viewed', getViewedProfiles)

// Get profile view statistics
router.get('/stats', getProfileViewStats)

export default router
