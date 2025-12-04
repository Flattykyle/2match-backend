import { Router } from 'express'
import {
  register,
  login,
  getCurrentUser,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
} from '../controllers/authController'
import { authenticate } from '../middleware/auth'

const router = Router()

// Public routes
router.post('/register', register)
router.post('/login', login)
router.post('/refresh-token', refreshToken)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

// Protected routes (require authentication)
router.get('/me', authenticate, getCurrentUser)
router.post('/logout', authenticate, logout)

export default router
