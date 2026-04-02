import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// ----------------------------------------
// GET ALL CONVERSATIONS
// ----------------------------------------
export const getConversations = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // Only show accepted conversations in main inbox
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { user1Id: req.userId },
          { user2Id: req.userId },
        ],
        requestStatus: 'accepted',
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
        user2: {
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
            isRead: true,
            senderId: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    })

    // Get unread count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            receiverId: req.userId,
            isRead: false,
          },
        })

        // Determine the other user
        const otherUser =
          conversation.user1Id === req.userId
            ? conversation.user2
            : conversation.user1

        return {
          ...conversation,
          otherUser,
          lastMessage: conversation.messages[0] || null,
          unreadCount,
        }
      })
    )

    res.json(conversationsWithUnread)
  } catch (error) {
    console.error('Get conversations error:', error)
    res.status(500).json({ message: 'Error fetching conversations' })
  }
}

// ----------------------------------------
// GET OR CREATE CONVERSATION
// ----------------------------------------
export const getOrCreateConversation = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { userId } = req.params

    if (!userId) {
      res.status(400).json({ message: 'User ID is required' })
      return
    }

    if (userId === req.userId) {
      res.status(400).json({ message: 'Cannot create conversation with yourself' })
      return
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: req.userId, user2Id: userId },
          { user1Id: userId, user2Id: req.userId },
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
          },
        },
        user2: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
      },
    })

    // Create conversation if it doesn't exist
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user1Id: req.userId,
          user2Id: userId,
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
          user2: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              profilePictures: true,
            },
          },
        },
      })
    }

    // Determine the other user
    const otherUser =
      conversation.user1Id === req.userId
        ? conversation.user2
        : conversation.user1

    res.json({
      ...conversation,
      otherUser,
    })
  } catch (error) {
    console.error('Get or create conversation error:', error)
    res.status(500).json({ message: 'Error creating conversation' })
  }
}

// ----------------------------------------
// GET CONVERSATION MESSAGES
// ----------------------------------------
export const getMessages = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { conversationId } = req.params
    const { limit = '50', before } = req.query

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: req.userId },
          { user2Id: req.userId },
        ],
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found' })
      return
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false, // Exclude soft-deleted expired messages
        ...(before && {
          sentAt: {
            lt: new Date(before as string),
          },
        }),
      },
      include: {
        sender: {
          select: {
            id: true,
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
      orderBy: {
        sentAt: 'desc',
      },
      take: parseInt(limit as string, 10),
    })

    res.json(messages.reverse()) // Return in chronological order
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({ message: 'Error fetching messages' })
  }
}

// ----------------------------------------
// SEND MESSAGE (REST endpoint as fallback)
// ----------------------------------------
export const sendMessage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { conversationId } = req.params
    const { content } = req.body

    if (!content || content.trim() === '') {
      res.status(400).json({ message: 'Message content is required' })
      return
    }

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: req.userId },
          { user2Id: req.userId },
        ],
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found' })
      return
    }

    // Determine receiver
    const receiverId =
      conversation.user1Id === req.userId
        ? conversation.user2Id
        : conversation.user1Id

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Create message with expiry
    const message = await prisma.message.create({
      data: {
        senderId: req.userId,
        receiverId,
        conversationId,
        content: content.trim(),
        expiresAt,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
          },
        },
        reactions: true,
      },
    })

    // Clear expiresAt on the other user's previous messages (they got a reply)
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: receiverId,
        receiverId: req.userId,
        expiresAt: { not: null },
        isDeleted: false,
      },
      data: { expiresAt: null },
    })

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    })

    res.status(201).json(message)
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ message: 'Error sending message' })
  }
}

// ----------------------------------------
// MARK MESSAGES AS READ
// ----------------------------------------
export const markAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { conversationId } = req.params

    // Verify user is part of conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [
          { user1Id: req.userId },
          { user2Id: req.userId },
        ],
      },
    })

    if (!conversation) {
      res.status(404).json({ message: 'Conversation not found' })
      return
    }

    // Mark all messages as read with timestamp
    await prisma.message.updateMany({
      where: {
        conversationId,
        receiverId: req.userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    res.json({ message: 'Messages marked as read' })
  } catch (error) {
    console.error('Mark as read error:', error)
    res.status(500).json({ message: 'Error marking messages as read' })
  }
}

// ----------------------------------------
// GET UNREAD COUNT
// ----------------------------------------
export const getUnreadCount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const unreadCount = await prisma.message.count({
      where: {
        receiverId: req.userId,
        isRead: false,
      },
    })

    res.json({ unreadCount })
  } catch (error) {
    console.error('Get unread count error:', error)
    res.status(500).json({ message: 'Error fetching unread count' })
  }
}
