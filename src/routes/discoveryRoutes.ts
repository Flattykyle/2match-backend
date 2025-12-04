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

const router = Router()

// All routes require authentication
router.use(authenticate)

// Discovery routes
router.get('/potential-matches', getPotentialMatches)
router.get('/liked-users', getLikedUsers)
router.get('/blocked-users', getBlockedUsers)
router.get('/search', searchUsers)
router.post('/like/:userId', likeUser)
router.post('/pass/:userId', passUser)
router.post('/block/:userId', blockUser)
router.delete('/block/:userId', unblockUser)
router.delete('/pass/:userId', undoPass)

export default router
