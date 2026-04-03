import { Router } from 'express'
import { getUsers, getUserById, updateProfile, completeProfile } from '../controllers/userController'
import { getUserVibeTags, updateUserVibeTags } from '../controllers/vibeTagController'
import { uploadVoiceIntro, deleteVoiceIntro } from '../controllers/voiceIntroController'
import { reportUserNew, blockUserNew } from '../controllers/reportBlockController'
import { authenticate } from '../middleware/auth'
import { uploadAudioSingle } from '../middleware/upload'

const router = Router()

router.get('/', authenticate, getUsers)
router.patch('/complete-profile', authenticate, completeProfile)
router.get('/me/vibe-tags', authenticate, getUserVibeTags)
router.put('/me/vibe-tags', authenticate, updateUserVibeTags)
router.post('/me/voice-intro', authenticate, uploadAudioSingle, uploadVoiceIntro)
router.delete('/me/voice-intro', authenticate, deleteVoiceIntro)

// Report & block
router.post('/:userId/report', authenticate, reportUserNew)
router.post('/:userId/block', authenticate, blockUserNew)

router.get('/:id', authenticate, getUserById)
router.put('/profile', authenticate, updateProfile)

export default router
