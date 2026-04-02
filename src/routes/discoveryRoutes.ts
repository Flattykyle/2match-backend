import { Router } from 'express'
import {
  getPotentialMatches,
  likeUser,
  passUser,
  blockUser,
  unblockUser,
  getBlockedUsers,
  undoPass,
  getLikedUsers,
  searchUsers,
} from '../controllers/discoveryController'
import { authenticate } from '../middleware/auth'
import { checkSlowMode } from '../middleware/safety'
import { checkFreeTierLikeLimit } from '../middleware/subscription'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Discovery routes
router.get('/potential-matches', getPotentialMatches)
router.get('/liked-users', getLikedUsers)
router.get('/blocked-users', getBlockedUsers)
router.get('/search', searchUsers)
// checkFreeTierLikeLimit: FREE users limited to 5 likes/day
// checkSlowMode: if slow mode on and daily match limit reached, reject
router.post('/like/:userId', checkFreeTierLikeLimit, checkSlowMode, likeUser)
router.post('/pass/:userId', passUser)
router.post('/block/:userId', blockUser)
router.delete('/block/:userId', unblockUser)
router.delete('/pass/:userId', undoPass)

export default router
