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
// BEFORE: router.post('/refresh-token', refreshToken)
// AFTER: POST /auth/refresh — reads refresh_token from httpOnly cookie, no body needed
router.post('/refresh-token', refreshToken) // keep old path for backward compat
router.post('/refresh', refreshToken)       // new canonical path
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

// Protected routes (require authentication)
router.get('/me', authenticate, getCurrentUser)
router.post('/logout', authenticate, logout)

export default router
