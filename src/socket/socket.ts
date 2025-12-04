import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { verifyToken } from '../utils/jwt'
import prisma from '../utils/prisma'

// Store connected users: userId -> socketId
const connectedUsers = new Map<string, string>()

// Store typing status: conversationId -> Set<userId>
const typingUsers = new Map<string, Set<string>>()

export const setupSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token

      if (!token) {
        return next(new Error('Authentication error: No token provided'))
      }

      const decoded = verifyToken(token)

      if (decoded.type !== 'access') {
        return next(new Error('Authentication error: Invalid token type'))
      }

      // Attach userId to socket
      socket.data.userId = decoded.userId
      next()
    } catch (error) {
      next(new Error('Authentication error: Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId
    console.log(`User connected: ${userId} (${socket.id})`)

    // Store user connection
    connectedUsers.set(userId, socket.id)

    // Update user's online status in database
    const setUserOnline = async () => {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            isOnline: true,
            lastActive: new Date(),
          },
        })
      } catch (error) {
        console.error('Error setting user online:', error)
      }
    }

    setUserOnline()

    // Emit online status to user's conversations
    socket.broadcast.emit('user_online', { userId })

    // Join user to their conversation rooms
    const setupUserRooms = async () => {
      try {
        const conversations = await prisma.conversation.findMany({
          where: {
            OR: [{ user1Id: userId }, { user2Id: userId }],
          },
          select: { id: true },
        })

        conversations.forEach((conv) => {
          socket.join(`conversation:${conv.id}`)
        })
      } catch (error) {
        console.error('Error setting up user rooms:', error)
      }
    }

    setupUserRooms()

    // Handle new message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, receiverId, content } = data

        // Create message in database
        const message = await prisma.message.create({
          data: {
            senderId: userId,
            receiverId,
            conversationId,
            content,
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
          },
        })

        // Update conversation lastMessageAt
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        })

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', message)
      } catch (error) {
        console.error('Error sending message:', error)
        socket.emit('message_error', { error: 'Failed to send message' })
      }
    })

    // Handle typing indicator
    socket.on('typing_start', ({ conversationId }) => {
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Set())
      }
      typingUsers.get(conversationId)!.add(userId)

      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId,
        conversationId,
      })
    })

    socket.on('typing_stop', ({ conversationId }) => {
      if (typingUsers.has(conversationId)) {
        typingUsers.get(conversationId)!.delete(userId)
      }

      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        userId,
        conversationId,
      })
    })

    // Handle mark as read
    socket.on('mark_as_read', async ({ conversationId }) => {
      try {
        await prisma.message.updateMany({
          where: {
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          data: { isRead: true },
        })

        socket.to(`conversation:${conversationId}`).emit('messages_read', {
          conversationId,
          readBy: userId,
        })
      } catch (error) {
        console.error('Error marking messages as read:', error)
      }
    })

    // Handle heartbeat to update lastActive
    socket.on('heartbeat', async () => {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { lastActive: new Date() },
        })
      } catch (error) {
        console.error('Error updating lastActive:', error)
      }
    })

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (${socket.id})`)
      connectedUsers.delete(userId)

      // Update user's offline status in database
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            isOnline: false,
            lastActive: new Date(),
          },
        })
      } catch (error) {
        console.error('Error setting user offline:', error)
      }

      // Clean up typing status
      typingUsers.forEach((users, conversationId) => {
        if (users.has(userId)) {
          users.delete(userId)
          socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
            userId,
            conversationId,
          })
        }
      })

      // Emit offline status
      socket.broadcast.emit('user_offline', { userId })
    })
  })

  return io
}

export const getConnectedUsers = () => connectedUsers
