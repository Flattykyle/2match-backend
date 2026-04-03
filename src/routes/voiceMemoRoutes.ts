import { Router } from 'express'
import { uploadProfileVoiceMemo, deleteProfileVoiceMemo } from '../controllers/voiceMemoController'
import { authenticate } from '../middleware/auth'
import { uploadAudioSingle } from '../middleware/upload'

const router = Router()

router.post('/profile', authenticate, uploadAudioSingle, uploadProfileVoiceMemo)
router.delete('/profile', authenticate, deleteProfileVoiceMemo)

export default router
