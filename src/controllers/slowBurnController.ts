import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { getSocketIO } from '../socket/socket'

export const createPromptExchange = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { matchId } = req.params
    const { question, answer } = req.body

    if (!question || !answer?.trim()) {
      return res.status(400).json({ error: 'Question and answer are required' })
    }

    // Verify user is part of this match
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: userId }, { userId2: userId }],
      },
    })

    if (!match) {
      return res.status(404).json({ error: 'Match not found' })
    }

    if (!match.slowBurnEnabled) {
      return res.status(400).json({ error: 'Slow burn mode is not enabled for this match' })
    }

    if (match.chatUnlocked) {
      return res.status(400).json({ error: 'Chat is already unlocked' })
    }

    // Create the prompt exchange
    const exchange = await prisma.promptExchange.create({
      data: {
        matchId,
        senderId: userId,
        question,
        answer: answer.trim(),
      },
      include: {
        sender: {
          select: { id: true, firstName: true, profilePictures: true },
        },
      },
    })

    // Increment exchangeCount by 0.5
    const newCount = match.exchangeCount + 0.5
    const chatUnlocked = newCount >= 3

    await prisma.match.update({
      where: { id: matchId },
      data: {
        exchangeCount: newCount,
        chatUnlocked,
      },
    })

    // Emit socket events to the match room
    const io = getSocketIO()
    if (io) {
      io.to(`match:${matchId}`).emit('slowburn:new_exchange', {
        exchange,
        exchangeCount: newCount,
        chatUnlocked,
      })

      if (chatUnlocked) {
        io.to(`match:${matchId}`).emit('slowburn:unlocked', { matchId })
      }
    }

    return res.status(201).json({
      exchange,
      exchangeCount: newCount,
      chatUnlocked,
    })
  } catch (error) {
    console.error('Create prompt exchange error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const getPromptExchanges = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const { matchId } = req.params

    // Verify user is part of this match
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: userId }, { userId2: userId }],
      },
    })

    if (!match) {
      return res.status(404).json({ error: 'Match not found' })
    }

    const exchanges = await prisma.promptExchange.findMany({
      where: { matchId },
      include: {
        sender: {
          select: { id: true, firstName: true, profilePictures: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return res.status(200).json({
      exchanges,
      exchangeCount: match.exchangeCount,
      chatUnlocked: match.chatUnlocked,
      slowBurnEnabled: match.slowBurnEnabled,
    })
  } catch (error) {
    console.error('Get prompt exchanges error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
