import { Router } from 'express'
import { getQuestions, submitAnswer } from '../controllers/icebreakerController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Get 2 random icebreaker questions for a match
router.get('/:matchId', getQuestions)

// Submit an answer to an icebreaker question
router.post('/:matchId/answer', submitAnswer)

export default router
