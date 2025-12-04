import { Router } from 'express'
import {
  sendEmailVerification,
  verifyEmail,
  sendPhoneVerification,
  verifyPhone,
  submitPhotoVerification,
  getVerificationStatus,
} from '../controllers/verificationController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Email verification
router.post('/email/send', sendEmailVerification)
router.post('/email/verify', verifyEmail)

// Phone verification
router.post('/phone/send', sendPhoneVerification)
router.post('/phone/verify', verifyPhone)

// Photo verification
router.post('/photo/submit', submitPhotoVerification)

// Get verification status
router.get('/status', getVerificationStatus)

export default router
