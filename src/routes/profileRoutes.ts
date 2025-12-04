import { Router } from 'express'
import {
  getProfileCompletion,
  uploadProfilePhoto,
  deleteProfilePhoto,
  reorderProfilePhotos,
  updateProfile,
} from '../controllers/profileController'
import { authenticate } from '../middleware/auth'
import { uploadSingle } from '../middleware/upload'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Profile completion
router.get('/completion', getProfileCompletion)

// Profile update
router.put('/', updateProfile)

// Photo management
router.post('/photos', uploadSingle, uploadProfilePhoto)
router.delete('/photos', deleteProfilePhoto)
router.put('/photos/reorder', reorderProfilePhotos)

export default router
