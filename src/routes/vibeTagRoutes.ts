import { Router } from 'express'
import { getAllVibeTags } from '../controllers/vibeTagController'
import { authenticate } from '../middleware/auth'

const router = Router()

// Public-ish (still needs auth to not leak data to crawlers)
router.get('/', authenticate, getAllVibeTags)

export default router
