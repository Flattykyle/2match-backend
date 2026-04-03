import { Router } from 'express'
import { likeUser, expressInterest, getMatches, getInterestsReceived, getAiStarters, regenerateAiStarters } from '../controllers/matchController'
import { createPromptExchange, getPromptExchanges } from '../controllers/slowBurnController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/like', authenticate, likeUser)
router.post('/express-interest', authenticate, expressInterest)
router.get('/', authenticate, getMatches)
router.get('/interests-received', authenticate, getInterestsReceived)

// AI conversation starters
router.get('/:matchId/ai-starters', authenticate, getAiStarters)
router.post('/:matchId/ai-starters/regenerate', authenticate, regenerateAiStarters)

// Slow Burn prompt exchange routes
router.post('/:matchId/prompt-exchange', authenticate, createPromptExchange)
router.get('/:matchId/prompt-exchanges', authenticate, getPromptExchanges)

export default router
