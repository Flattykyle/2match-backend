import { Router } from 'express'
import { getSafetySettings, updateSafetySettings, triggerSOS } from '../controllers/safetyController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/settings', getSafetySettings)
router.put('/settings', updateSafetySettings)
router.post('/sos', triggerSOS)

export default router
