import { Router } from 'express'
import { likeUser, getMatches } from '../controllers/matchController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/like', authenticate, likeUser)
router.get('/', authenticate, getMatches)

export default router
