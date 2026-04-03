import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// ----------------------------------------
// Get all conversations for the current user
// ----------------------------------------
export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    const conversations = await prisma.conversation.findMany({
      where: {
        AND: [
          { OR: [{ user1Id: userId }, { user2Id: userId }] },
          { requestStatus: 'accepted' },
        ],
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            isOnline: true,
            lastActive: true,
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            isOnline: true,
            lastActive: true,
          },
        },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            senderId: true,
            isRead: true,
            sentAt: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // Map to add otherUser, lastMessage, unreadCount
    const mapped = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = conv.user1Id === userId ? conv.user2 : conv.user1
        const lastMessage = conv.messages[0] || null

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            receiverId: userId,
            isRead: false,
            isDeleted: false,
          },
        })

        return {
          id: conv.id,
          otherUser,
          lastMessage,
          unreadCount,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
        }
      })
    )

    return res.status(200).json({ conversations: mapped })
  } catch (error) {
    console.error('Get conversations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ----------------------------------------
// Get or create a conversation with a user
// ----------------------------------------
export const getOrCreateConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { userId: otherUserId } = req.params

    if (userId === otherUserId) {
      return res.status(400).json({ error: 'Cannot create a conversation with yourself' })
    }

    // Check if other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        profilePictures: true,
        isOnline: true,
        lastActive: true,
      },
    })

    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Find existing conversation (check both directions)
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: otherUserId },
          { user1Id: otherUserId, user2Id: userId },
        ],
      },
    })

    // Create if not found
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user1Id: userId,
          user2Id: otherUserId,
        },
      })
    }

    return res.status(200).json({
      conversation: {
        ...conversation,
        otherUser,
      },
    })
  } catch (error) {
    console.error('Get or create conversation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ----------------------------------------
// Get messages for a conversation
// ----------------------------------------
export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { conversationId } = req.params
    const { limit: limitStr = '50' } = req.query as Record<string, string>

    const limit = parseInt(limitStr) || 50

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // Fetch messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
        reactions: {
          select: {
            id: true,
            userId: true,
            emoji: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
      take: limit,
    })

    // Reverse for chronological order
    messages.reverse()

    return res.status(200).json({ messages })
  } catch (error) {
    console.error('Get messages error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ----------------------------------------
// Send a message (REST fallback)
// ----------------------------------------
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { conversationId } = req.params
    const { content } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const receiverId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id

    // Create message with 7 day expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId,
        conversationId,
        content: content.trim(),
        expiresAt,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
        reactions: {
          select: {
            id: true,
            userId: true,
            emoji: true,
          },
        },
      },
    })

    // Reply clears expiry on other user's previous messages
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: receiverId,
        receiverId: userId,
        expiresAt: { not: null },
      },
      data: {
        expiresAt: null,
      },
    })

    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })

    return res.status(201).json({ message })
  } catch (error) {
    console.error('Send message error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ----------------------------------------
// Mark messages as read
// ----------------------------------------
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!
    const { conversationId } = req.params

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    // Update all unread messages addressed to this user
    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return res.status(200).json({
      message: 'Messages marked as read',
      count: result.count,
    })
  } catch (error) {
    console.error('Mark as read error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// ----------------------------------------
// Get unread message count
// ----------------------------------------
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    const count = await prisma.message.count({
      where: {
        receiverId: userId,
        isRead: false,
        isDeleted: false,
      },
    })

    return res.status(200).json({ unreadCount: count })
  } catch (error) {
    console.error('Get unread count error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
