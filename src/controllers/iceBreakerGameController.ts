import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getSocketIO } from '../socket/socket'

// ----------------------------------------
// Helper: verify user belongs to match, return match + other user id
// ----------------------------------------
async function verifyMatchMembership(matchId: string, userId: string) {
  const match = await prisma.match.findFirst({
    where: {
      id: matchId,
      OR: [{ userId1: userId }, { userId2: userId }],
    },
  })
  if (!match) return null
  const otherUserId = match.userId1 === userId ? match.userId2 : match.userId1
  const isUserA = match.userId1 === userId
  return { match, otherUserId, isUserA }
}

// ----------------------------------------
// POST /api/icebreaker/start
// Body: { matchId, gameType }
// Creates an IceBreakerGame record, emits socket invite
// ----------------------------------------
export const startGame = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { matchId, gameType } = req.body

    if (!matchId || !gameType) {
      res.status(400).json({ message: 'matchId and gameType are required' })
      return
    }

    const validTypes = ['TWO_TRUTHS', 'HOT_TAKES', 'WOULD_YOU_RATHER']
    if (!validTypes.includes(gameType)) {
      res.status(400).json({ message: 'Invalid gameType' })
      return
    }

    const result = await verifyMatchMembership(matchId, req.userId)
    if (!result) {
      res.status(404).json({ message: 'Match not found' })
      return
    }

    // Rate limit: 1 game per match at a time (no active/pending game)
    const existingGame = await prisma.iceBreakerGame.findUnique({
      where: { matchId },
    })

    if (existingGame && existingGame.status !== 'COMPLETED') {
      res.status(409).json({ message: 'A game is already in progress for this match' })
      return
    }

    // If there's a completed game, delete it to allow a new one (unique constraint on matchId)
    if (existingGame) {
      await prisma.iceBreakerGame.delete({ where: { id: existingGame.id } })
    }

    const game = await prisma.iceBreakerGame.create({
      data: {
        matchId,
        gameType,
        startedBy: req.userId,
        status: 'PENDING',
      },
    })

    // Emit socket event to the other user
    const io = getSocketIO()
    if (io) {
      io.to(`match:${matchId}`).emit('icebreaker:invited', {
        gameId: game.id,
        gameType: game.gameType,
        fromUser: req.userId,
      })
    }

    res.status(201).json({ game })
  } catch (error) {
    console.error('Start icebreaker game error:', error)
    res.status(500).json({ message: 'Error starting icebreaker game' })
  }
}

// ----------------------------------------
// POST /api/icebreaker/:gameId/submit
// Body: { answers: string[] }
// Saves answers to payloadA or payloadB depending on sender
// ----------------------------------------
export const submitAnswers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { gameId } = req.params
    const { answers } = req.body

    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ message: 'answers array is required' })
      return
    }

    const game = await prisma.iceBreakerGame.findUnique({
      where: { id: gameId },
      include: { match: true },
    })

    if (!game) {
      res.status(404).json({ message: 'Game not found' })
      return
    }

    const { match } = game
    const userId = req.userId

    // Verify user belongs to this match
    if (match.userId1 !== userId && match.userId2 !== userId) {
      res.status(403).json({ message: 'Not authorized' })
      return
    }

    if (game.status === 'COMPLETED') {
      res.status(400).json({ message: 'Game already completed' })
      return
    }

    // Validate answers based on game type
    const validationError = validateAnswers(game.gameType, answers)
    if (validationError) {
      res.status(400).json({ message: validationError })
      return
    }

    // Determine which payload slot (A = userId1, B = userId2)
    const isUserA = match.userId1 === userId
    const payloadField = isUserA ? 'payloadA' : 'payloadB'

    // Check if this user already submitted
    const currentPayload = isUserA ? game.payloadA : game.payloadB
    if (currentPayload !== null) {
      res.status(400).json({ message: 'You have already submitted answers' })
      return
    }

    // Build the payload based on game type
    const payload = buildPayload(game.gameType, answers)

    // Check if the other user has already submitted
    const otherPayload = isUserA ? game.payloadB : game.payloadA
    const bothSubmitted = otherPayload !== null

    const newStatus = bothSubmitted ? 'COMPLETED' : 'IN_PROGRESS'
    const result = bothSubmitted
      ? computeResult(game.gameType, isUserA ? payload : otherPayload, isUserA ? otherPayload : payload)
      : undefined

    const updatedGame = await prisma.iceBreakerGame.update({
      where: { id: gameId },
      data: {
        [payloadField]: payload,
        status: newStatus,
        ...(result !== undefined ? { result } : {}),
      },
    })

    const io = getSocketIO()
    const matchId = game.matchId

    if (bothSubmitted) {
      // Both submitted — emit completed event
      if (io) {
        io.to(`match:${matchId}`).emit('icebreaker:completed', {
          gameId: game.id,
          result: updatedGame.result,
        })
      }
    } else {
      // Only one submitted — notify partner without leaking payload
      if (io) {
        io.to(`match:${matchId}`).emit('icebreaker:partner_submitted', {
          gameId: game.id,
        })
      }
    }

    res.json({
      game: updatedGame,
      completed: bothSubmitted,
    })
  } catch (error) {
    console.error('Submit icebreaker answers error:', error)
    res.status(500).json({ message: 'Error submitting answers' })
  }
}

// ----------------------------------------
// GET /api/icebreaker/:matchId
// Get the current game for a match
// ----------------------------------------
export const getGame = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { matchId } = req.params

    const result = await verifyMatchMembership(matchId, req.userId)
    if (!result) {
      res.status(404).json({ message: 'Match not found' })
      return
    }

    const game = await prisma.iceBreakerGame.findUnique({
      where: { matchId },
    })

    if (!game) {
      res.json({ game: null })
      return
    }

    // Only reveal the other user's payload if game is completed
    const { isUserA } = result
    const sanitizedGame = sanitizeGameForUser(game, isUserA)

    res.json({ game: sanitizedGame })
  } catch (error) {
    console.error('Get icebreaker game error:', error)
    res.status(500).json({ message: 'Error fetching icebreaker game' })
  }
}

// ----------------------------------------
// PATCH /api/icebreaker/:gameId/guess
// Body: { guessIndex: number }
// For TWO_TRUTHS: store which statement the user thinks is the lie
// ----------------------------------------
export const submitGuess = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { gameId } = req.params
    const { guessIndex } = req.body

    if (guessIndex === undefined || typeof guessIndex !== 'number') {
      res.status(400).json({ message: 'guessIndex (number) is required' })
      return
    }

    if (guessIndex < 0 || guessIndex > 2) {
      res.status(400).json({ message: 'guessIndex must be 0, 1, or 2' })
      return
    }

    const game = await prisma.iceBreakerGame.findUnique({
      where: { id: gameId },
      include: { match: true },
    })

    if (!game) {
      res.status(404).json({ message: 'Game not found' })
      return
    }

    if (game.gameType !== 'TWO_TRUTHS') {
      res.status(400).json({ message: 'Guesses are only for TWO_TRUTHS games' })
      return
    }

    if (game.status !== 'COMPLETED') {
      res.status(400).json({ message: 'Game must be completed before guessing' })
      return
    }

    const { match } = game
    const userId = req.userId

    if (match.userId1 !== userId && match.userId2 !== userId) {
      res.status(403).json({ message: 'Not authorized' })
      return
    }

    const isUserA = match.userId1 === userId
    const guessField = isUserA ? 'guessA' : 'guessB'

    const updatedGame = await prisma.iceBreakerGame.update({
      where: { id: gameId },
      data: {
        [guessField]: { guessIndex },
      },
    })

    res.json({ game: updatedGame })
  } catch (error) {
    console.error('Submit guess error:', error)
    res.status(500).json({ message: 'Error submitting guess' })
  }
}

// ----------------------------------------
// Validation helpers
// ----------------------------------------
function validateAnswers(gameType: string, answers: string[]): string | null {
  switch (gameType) {
    case 'TWO_TRUTHS':
      if (answers.length !== 3) return 'TWO_TRUTHS requires exactly 3 statements'
      if (answers.some((a) => typeof a !== 'string' || a.trim().length === 0))
        return 'All statements must be non-empty strings'
      return null

    case 'HOT_TAKES':
      if (answers.length !== 1) return 'HOT_TAKES requires exactly 1 answer'
      if (typeof answers[0] !== 'string' || answers[0].trim().length === 0)
        return 'Answer must be a non-empty string'
      return null

    case 'WOULD_YOU_RATHER':
      if (answers.length !== 5) return 'WOULD_YOU_RATHER requires exactly 5 answers'
      if (answers.some((a) => a !== 'A' && a !== 'B'))
        return 'Each answer must be "A" or "B"'
      return null

    default:
      return 'Unknown game type'
  }
}

function buildPayload(gameType: string, answers: string[]): object {
  switch (gameType) {
    case 'TWO_TRUTHS':
      return { statements: answers }
    case 'HOT_TAKES':
      return { answer: answers[0] }
    case 'WOULD_YOU_RATHER':
      return { answers }
    default:
      return { answers }
  }
}

function computeResult(
  gameType: string,
  payloadA: unknown,
  payloadB: unknown
): object | undefined {
  switch (gameType) {
    case 'TWO_TRUTHS':
      // No auto-reveal — users guess in frontend
      return { type: 'TWO_TRUTHS', status: 'awaiting_guesses' }

    case 'HOT_TAKES': {
      const a = payloadA as { answer: string }
      const b = payloadB as { answer: string }
      const match = a.answer === b.answer
      return {
        type: 'HOT_TAKES',
        match,
        answerA: a.answer,
        answerB: b.answer,
      }
    }

    case 'WOULD_YOU_RATHER': {
      const a = payloadA as { answers: string[] }
      const b = payloadB as { answers: string[] }
      const matchingCount = a.answers.reduce(
        (count, ans, i) => count + (ans === b.answers[i] ? 1 : 0),
        0
      )
      const matchScore = matchingCount / 5
      return {
        type: 'WOULD_YOU_RATHER',
        matchScore,
        matchingCount,
        totalQuestions: 5,
        answersA: a.answers,
        answersB: b.answers,
      }
    }

    default:
      return undefined
  }
}

// Strip the other user's payload if game isn't completed yet
function sanitizeGameForUser(game: any, isUserA: boolean) {
  if (game.status === 'COMPLETED') {
    return game
  }

  return {
    ...game,
    // Only show this user's own payload
    payloadA: isUserA ? game.payloadA : null,
    payloadB: isUserA ? null : game.payloadB,
  }
}
