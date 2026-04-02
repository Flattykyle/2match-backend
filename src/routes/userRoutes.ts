import { Router } from 'express'
import { getUsers, getUserById, updateProfile } from '../controllers/userController'
import { getUserVibeTags, updateUserVibeTags } from '../controllers/vibeTagController'
import { uploadVoiceIntro, deleteVoiceIntro } from '../controllers/voiceIntroController'
import { authenticate } from '../middleware/auth'
import { uploadAudioSingle } from '../middleware/upload'

const router = Router()

router.get('/', authenticate, getUsers)
router.get('/me/vibe-tags', authenticate, getUserVibeTags)
router.put('/me/vibe-tags', authenticate, updateUserVibeTags)
router.post('/me/voice-intro', authenticate, uploadAudioSingle, uploadVoiceIntro)
router.delete('/me/voice-intro', authenticate, deleteVoiceIntro)
router.get('/:id', authenticate, getUserById)
router.put('/profile', authenticate, updateProfile)

export default router
