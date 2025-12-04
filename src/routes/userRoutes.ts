import { Router } from 'express'
import { getUsers, getUserById, updateProfile } from '../controllers/userController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, getUsers)
router.get('/:id', authenticate, getUserById)
router.put('/profile', authenticate, updateProfile)

export default router
