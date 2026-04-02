import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// ----------------------------------------
// GET PENDING CHAT REQUESTS
// GET /api/messages/requests
// ----------------------------------------
export const getChatRequests = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // Pending conversations where this user is the recipient (user2)
    // user1 initiated the conversation, user2 needs to accept
    const requests = await prisma.conversation.findMany({
      where: {
        user2Id: req.userId,
        requestStatus: 'pending',
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            sentAt: true,
            senderId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = requests.map((r) => ({
      conversationId: r.id,
      from: r.user1,
      lastMessage: r.messages[0] || null,
      createdAt: r.createdAt,
    }))

    res.json({ requests: formatted })
  } catch (error) {
    console.error('Get chat requests error:', error)
    res.status(500).json({ message: 'Error fetching chat requests' })
  }
}

// ----------------------------------------
// ACCEPT CHAT REQUEST
// POST /api/messages/requests/:conversationId/accept
// ----------------------------------------
export const acceptChatRequest = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { conversationId } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        user2Id: req.userId,
        requestStatus: 'pending',
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Chat request not found' })
      return
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { requestStatus: 'accepted' },
    })

    res.json({ message: 'Chat request accepted' })
  } catch (error) {
    console.error('Accept chat request error:', error)
    res.status(500).json({ message: 'Error accepting chat request' })
  }
}

// ----------------------------------------
// DECLINE CHAT REQUEST
// POST /api/messages/requests/:conversationId/decline
// ----------------------------------------
export const declineChatRequest = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { conversationId } = req.params

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        user2Id: req.userId,
        requestStatus: 'pending',
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Chat request not found' })
      return
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { requestStatus: 'declined' },
    })

    res.json({ message: 'Chat request declined' })
  } catch (error) {
    console.error('Decline chat request error:', error)
    res.status(500).json({ message: 'Error declining chat request' })
  }
}
