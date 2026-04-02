import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getSocketIO } from '../socket/socket'

// ----------------------------------------
// GET ICEBREAKER QUESTIONS FOR A MATCH
// GET /api/icebreakers/:matchId
// Returns 2 random active questions for this match.
// If questions were already assigned (answers exist), return those same questions.
// ----------------------------------------
export const getQuestions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { matchId } = req.params

    // Verify the match exists and this user is part of it
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
      include: {
        user1: {
          select: { id: true, firstName: true, profilePictures: true },
        },
        user2: {
          select: { id: true, firstName: true, profilePictures: true },
        },
      },
    })

    if (!match) {
      res.status(404).json({ message: 'Match not found' })
      return
    }

    // Check if questions were already assigned for this match (answers exist)
    const existingAnswers = await prisma.icebreakerAnswer.findMany({
      where: { matchId },
      select: { questionId: true },
      distinct: ['questionId'],
    })

    let questions

    if (existingAnswers.length > 0) {
      // Return the same questions that were already assigned
      questions = await prisma.icebreakerQuestion.findMany({
        where: {
          id: { in: existingAnswers.map((a) => a.questionId) },
        },
      })
    } else {
      // Pick 2 random active questions
      // Use raw query for random selection since Prisma doesn't support ORDER BY RANDOM natively
      const allActive = await prisma.icebreakerQuestion.findMany({
        where: { isActive: true },
      })

      if (allActive.length < 2) {
        res.status(500).json({ message: 'Not enough icebreaker questions available' })
        return
      }

      // Fisher-Yates shuffle, pick first 2
      for (let i = allActive.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allActive[i], allActive[j]] = [allActive[j], allActive[i]]
      }
      questions = allActive.slice(0, 2)
    }

    // Get this user's existing answers for this match
    const myAnswers = await prisma.icebreakerAnswer.findMany({
      where: { matchId, userId: req.userId },
      select: { questionId: true, answer: true },
    })

    // Get count of other user's answers (don't reveal their answers yet)
    const otherUserId = match.userId1 === req.userId ? match.userId2 : match.userId1
    const otherAnswerCount = await prisma.icebreakerAnswer.count({
      where: { matchId, userId: otherUserId },
    })

    res.json({
      match: {
        id: match.id,
        icebreakerUnlocked: match.icebreakerUnlocked,
        user1: match.user1,
        user2: match.user2,
      },
      questions,
      myAnswers,
      otherUserAnswered: otherAnswerCount >= 2,
    })
  } catch (error) {
    console.error('Get icebreaker questions error:', error)
    res.status(500).json({ message: 'Error fetching icebreaker questions' })
  }
}

// ----------------------------------------
// SUBMIT ICEBREAKER ANSWER
// POST /api/icebreakers/:matchId/answer
// Body: { questionId, answer }
// If both users have answered both questions → unlock chat
// ----------------------------------------
export const submitAnswer = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { matchId } = req.params
    const { questionId, answer } = req.body

    if (!questionId || !answer) {
      res.status(400).json({ message: 'questionId and answer are required' })
      return
    }

    // Verify the match exists and this user is part of it
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
    })

    if (!match) {
      res.status(404).json({ message: 'Match not found' })
      return
    }

    if (match.icebreakerUnlocked) {
      res.status(400).json({ message: 'Icebreaker already completed for this match' })
      return
    }

    // Verify the question exists and is active
    const question = await prisma.icebreakerQuestion.findFirst({
      where: { id: questionId, isActive: true },
    })

    if (!question) {
      res.status(404).json({ message: 'Question not found' })
      return
    }

    // Verify the answer is one of the valid options
    const options = question.options as string[]
    if (!options.includes(answer)) {
      res.status(400).json({ message: 'Invalid answer option' })
      return
    }

    // Save or update the answer (upsert to handle re-submissions)
    await prisma.icebreakerAnswer.upsert({
      where: {
        matchId_userId_questionId: {
          matchId,
          userId: req.userId,
          questionId,
        },
      },
      update: { answer, answeredAt: new Date() },
      create: {
        matchId,
        userId: req.userId,
        questionId,
        answer,
      },
    })

    // Check if both users have answered both questions
    const otherUserId = match.userId1 === req.userId ? match.userId2 : match.userId1

    const [myAnswerCount, otherAnswerCount] = await Promise.all([
      prisma.icebreakerAnswer.count({
        where: { matchId, userId: req.userId },
      }),
      prisma.icebreakerAnswer.count({
        where: { matchId, userId: otherUserId },
      }),
    ])

    const bothCompleted = myAnswerCount >= 2 && otherAnswerCount >= 2

    if (bothCompleted && !match.icebreakerUnlocked) {
      // Unlock the chat
      await prisma.match.update({
        where: { id: matchId },
        data: { icebreakerUnlocked: true },
      })

      // Get both users' answers for the reveal
      const allAnswers = await prisma.icebreakerAnswer.findMany({
        where: { matchId },
        include: {
          question: { select: { id: true, text: true } },
        },
        orderBy: { answeredAt: 'asc' },
      })

      // Emit "chat-unlocked" to both users via Socket.IO
      const io = getSocketIO()
      if (io) {
        // Find the conversation for this match pair
        const conversation = await prisma.conversation.findFirst({
          where: {
            OR: [
              { user1Id: match.userId1, user2Id: match.userId2 },
              { user1Id: match.userId2, user2Id: match.userId1 },
            ],
          },
        })

        const payload = {
          matchId,
          answers: allAnswers,
          conversationId: conversation?.id,
        }

        // Emit to the match room (both users joined on match page)
        io.to(`match:${matchId}`).emit('chat-unlocked', payload)
      }

      res.json({
        message: 'Icebreaker complete! Chat unlocked.',
        unlocked: true,
        myAnswerCount,
        otherUserAnswered: true,
      })
    } else {
      res.json({
        message: 'Answer saved',
        unlocked: false,
        myAnswerCount,
        otherUserAnswered: otherAnswerCount >= 2,
      })
    }
  } catch (error) {
    console.error('Submit icebreaker answer error:', error)
    res.status(500).json({ message: 'Error submitting answer' })
  }
}
