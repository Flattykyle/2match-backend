import { Router } from 'express'
import {
  startGame,
  submitAnswers,
  getGame,
  submitGuess,
} from '../controllers/iceBreakerGameController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Start a new icebreaker game for a match
router.post('/start', startGame)

// Submit answers for a game
router.post('/:gameId/submit', submitAnswers)

// Submit a guess (TWO_TRUTHS only)
router.patch('/:gameId/guess', submitGuess)

// Get the current game for a match
router.get('/:matchId', getGame)

export default router
