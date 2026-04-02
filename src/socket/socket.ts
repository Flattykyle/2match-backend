import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import cookie from 'cookie'
import { verifyToken } from '../utils/jwt'
import prisma from '../utils/prisma'
import { logWarn } from '../utils/logger'

// Singleton IO instance for emitting from controllers (e.g. icebreaker chat-unlocked)
let ioInstance: Server | null = null
export const getSocketIO = (): Server | null => ioInstance

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
  // BEFORE: Read token from socket.handshake.auth.token (sent from JS, accessible to XSS)
  // AFTER: Parse token from httpOnly cookie in the handshake headers
  io.use(async (socket: Socket, next) => {
    try {
      // BEFORE: const token = socket.handshake.auth.token
      // AFTER: Extract access_token from Cookie header
      const cookieHeader = socket.handshake.headers.cookie
      if (!cookieHeader) {
        return next(new Error('Authentication error: No cookies provided'))
      }

      const cookies = cookie.parse(cookieHeader)
      const token = cookies.access_token

      if (!token) {
        return next(new Error('Authentication error: No access token in cookies'))
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

  // Store io instance for external access (e.g. icebreaker controller emitting chat-unlocked)
  ioInstance = io

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

    // Join match-specific room (for icebreaker events like "chat-unlocked")
    socket.on('join-match', async (data: { matchId: string }) => {
      try {
        const { matchId } = data
        if (!matchId) return

        // Verify user is part of this match
        const match = await prisma.match.findFirst({
          where: {
            id: matchId,
            OR: [{ userId1: userId }, { userId2: userId }],
          },
        })

        if (!match) {
          socket.emit('room_error', { error: 'Not authorized for this match room' })
          return
        }

        socket.join(`match:${matchId}`)
      } catch (error) {
        console.error('Error joining match room:', error)
      }
    })

    // BEFORE: No "join-room" handler — rooms were only set up on connection
    // AFTER: Validate room joins — confirm both users are matched via Prisma before allowing
    socket.on('join-room', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data

        if (!conversationId) {
          logWarn(`Unauthorized room join attempt: missing conversationId`, { userId, socketId: socket.id })
          socket.emit('room_error', { error: 'Conversation ID required' })
          return
        }

        // Query Prisma: verify the conversation exists and this user is a participant
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            OR: [{ user1Id: userId }, { user2Id: userId }],
          },
          select: { id: true, user1Id: true, user2Id: true },
        })

        if (!conversation) {
          logWarn(`Unauthorized room join attempt: user ${userId} tried to join conversation ${conversationId}`)
          socket.emit('room_error', { error: 'Not authorized to join this room' })
          socket.disconnect(true)
          return
        }

        // Verify both users are matched (a match record exists between them)
        const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id
        const match = await prisma.match.findFirst({
          where: {
            OR: [
              { userId1: userId, userId2: otherUserId },
              { userId1: otherUserId, userId2: userId },
            ],
          },
        })

        if (!match) {
          logWarn(`Unauthorized room join: no match between ${userId} and ${otherUserId} for conversation ${conversationId}`)
          socket.emit('room_error', { error: 'Users are not matched' })
          socket.disconnect(true)
          return
        }

        socket.join(`conversation:${conversationId}`)
        socket.emit('room_joined', { conversationId })
      } catch (error) {
        console.error('Error joining room:', error)
        socket.emit('room_error', { error: 'Failed to join room' })
      }
    })

    // Handle new message — now sets expiresAt and clears expiry on reply
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, receiverId, content } = data

        const now = new Date()
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days

        // Create message with expiry
        const message = await prisma.message.create({
          data: {
            senderId: userId,
            receiverId,
            conversationId,
            content,
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
            receiverId: userId,
            expiresAt: { not: null },
            isDeleted: false,
          },
          data: { expiresAt: null },
        })

        // Update conversation lastMessageAt
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: now },
        })

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', message)
      } catch (error) {
        console.error('Error sending message:', error)
        socket.emit('message_error', { error: 'Failed to send message' })
      }
    })

    // Typing — broadcast to room partner only (socket.to excludes sender)
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

    // Read receipt — update readAt timestamp + emit to sender
    socket.on('message_read', async ({ conversationId, messageIds }) => {
      try {
        const now = new Date()

        await prisma.message.updateMany({
          where: {
            id: { in: messageIds || [] },
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          data: { isRead: true, readAt: now },
        })

        // Also bulk-update any remaining unread
        await prisma.message.updateMany({
          where: {
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          data: { isRead: true, readAt: now },
        })

        // Emit read receipt to the sender (the other person in the room)
        socket.to(`conversation:${conversationId}`).emit('read_receipt', {
          conversationId,
          readBy: userId,
          readAt: now.toISOString(),
          messageIds,
        })
      } catch (error) {
        console.error('Error handling message_read:', error)
      }
    })

    // Legacy compat: keep mark_as_read working
    socket.on('mark_as_read', async ({ conversationId }) => {
      try {
        const now = new Date()
        await prisma.message.updateMany({
          where: {
            conversationId,
            receiverId: userId,
            isRead: false,
          },
          data: { isRead: true, readAt: now },
        })

        socket.to(`conversation:${conversationId}`).emit('read_receipt', {
          conversationId,
          readBy: userId,
          readAt: now.toISOString(),
        })
      } catch (error) {
        console.error('Error marking messages as read:', error)
      }
    })

    // React to a message — save reaction and broadcast to room
    socket.on('react_message', async ({ messageId, emoji, conversationId }) => {
      try {
        const allowedEmojis = ['❤️', '😂', '👏', '😮', '😢', '🔥']
        if (!allowedEmojis.includes(emoji)) return

        // Upsert: one reaction per user per message (changes emoji if already reacted)
        const reaction = await prisma.messageReaction.upsert({
          where: {
            messageId_userId: { messageId, userId },
          },
          update: { emoji },
          create: { messageId, userId, emoji },
        })

        io.to(`conversation:${conversationId}`).emit('reaction_added', {
          messageId,
          reaction: {
            id: reaction.id,
            userId,
            emoji,
          },
          conversationId,
        })
      } catch (error) {
        console.error('Error reacting to message:', error)
      }
    })

    // Remove a reaction
    socket.on('remove_reaction', async ({ messageId, conversationId }) => {
      try {
        await prisma.messageReaction.deleteMany({
          where: { messageId, userId },
        })

        io.to(`conversation:${conversationId}`).emit('reaction_removed', {
          messageId,
          userId,
          conversationId,
        })
      } catch (error) {
        console.error('Error removing reaction:', error)
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
