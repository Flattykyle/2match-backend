import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import cookie from 'cookie'
import { verifyToken } from '../utils/jwt'
import prisma from '../utils/prisma'
import { logWarn } from '../utils/logger'
import { allowedOrigins } from '../middleware/security'

let ioInstance: Server | null = null
export const getSocketIO = (): Server | null => ioInstance

const connectedUsers = new Map<string, string>()
const typingUsers = new Map<string, Set<string>>()

export const setupSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  // Auth middleware — read JWT from httpOnly cookie
  io.use(async (socket: Socket, next) => {
    try {
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

      socket.data.userId = decoded.userId
      next()
    } catch (error) {
      next(new Error('Authentication error: Invalid token'))
    }
  })

  ioInstance = io

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId
    console.log(`User connected: ${userId} (${socket.id})`)

    connectedUsers.set(userId, socket.id)

    // Set user online
    prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastActive: new Date() },
    }).catch((err) => console.error('Error setting user online:', err))

    socket.broadcast.emit('user_online', { userId })

    // Join conversation rooms
    prisma.conversation.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      select: { id: true },
    }).then((convs) => {
      convs.forEach((c) => socket.join(`conversation:${c.id}`))
    }).catch((err) => console.error('Error setting up rooms:', err))

    // Join match room (for icebreaker events)
    socket.on('join-match', async (data: { matchId: string }) => {
      try {
        const { matchId } = data
        if (!matchId) return

        const match = await prisma.match.findFirst({
          where: { id: matchId, OR: [{ userId1: userId }, { userId2: userId }] },
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

    // Join conversation room (validated)
    socket.on('join-room', async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data
        if (!conversationId) {
          logWarn('Unauthorized room join: missing conversationId', { userId, socketId: socket.id })
          socket.emit('room_error', { error: 'Conversation ID required' })
          return
        }

        const conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, OR: [{ user1Id: userId }, { user2Id: userId }] },
          select: { id: true, user1Id: true, user2Id: true },
        })

        if (!conversation) {
          logWarn(`Unauthorized room join: user ${userId} for conversation ${conversationId}`)
          socket.emit('room_error', { error: 'Not authorized to join this room' })
          socket.disconnect(true)
          return
        }

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
          logWarn(`Unauthorized room join: no match between ${userId} and ${otherUserId}`)
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

    // Send message — sets expiresAt, clears expiry on reply
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, receiverId, content } = data

        // Slow Burn gate: check if chat is locked
        const slowBurnMatch = await prisma.match.findFirst({
          where: {
            OR: [
              { userId1: userId, userId2: receiverId },
              { userId1: receiverId, userId2: userId },
            ],
          },
        })

        if (slowBurnMatch?.slowBurnEnabled && !slowBurnMatch.chatUnlocked) {
          socket.emit('message_error', {
            error: 'Chat locked',
            exchangeCount: slowBurnMatch.exchangeCount,
            required: 3,
          })
          return
        }

        const now = new Date()
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

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
              select: { id: true, firstName: true, lastName: true, profilePictures: true },
            },
            reactions: true,
          },
        })

        // Clear expiresAt on other user's unanswered messages (they got a reply)
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

        await prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: now },
        })

        io.to(`conversation:${conversationId}`).emit('new_message', message)
      } catch (error) {
        console.error('Error sending message:', error)
        socket.emit('message_error', { error: 'Failed to send message' })
      }
    })

    // Typing indicators
    socket.on('typing_start', ({ conversationId }) => {
      if (!typingUsers.has(conversationId)) typingUsers.set(conversationId, new Set())
      typingUsers.get(conversationId)!.add(userId)
      socket.to(`conversation:${conversationId}`).emit('user_typing', { userId, conversationId })
    })

    socket.on('typing_stop', ({ conversationId }) => {
      if (typingUsers.has(conversationId)) typingUsers.get(conversationId)!.delete(userId)
      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', { userId, conversationId })
    })

    // Read receipt — update readAt + emit to sender
    socket.on('message_read', async ({ conversationId, messageIds }) => {
      try {
        const now = new Date()
        await prisma.message.updateMany({
          where: {
            conversationId,
            receiverId: userId,
            isRead: false,
            ...(messageIds?.length ? { id: { in: messageIds } } : {}),
          },
          data: { isRead: true, readAt: now },
        })
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

    // Legacy compat
    socket.on('mark_as_read', async ({ conversationId }) => {
      try {
        const now = new Date()
        await prisma.message.updateMany({
          where: { conversationId, receiverId: userId, isRead: false },
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

    // React to message
    socket.on('react_message', async ({ messageId, emoji, conversationId }) => {
      try {
        const allowedEmojis = ['❤️', '😂', '👏', '😮', '😢', '🔥']
        if (!allowedEmojis.includes(emoji)) return

        const reaction = await prisma.messageReaction.upsert({
          where: { messageId_userId: { messageId, userId } },
          update: { emoji },
          create: { messageId, userId, emoji },
        })

        io.to(`conversation:${conversationId}`).emit('reaction_added', {
          messageId,
          reaction: { id: reaction.id, userId, emoji },
          conversationId,
        })
      } catch (error) {
        console.error('Error reacting to message:', error)
      }
    })

    // Remove reaction
    socket.on('remove_reaction', async ({ messageId, conversationId }) => {
      try {
        await prisma.messageReaction.deleteMany({ where: { messageId, userId } })
        io.to(`conversation:${conversationId}`).emit('reaction_removed', { messageId, userId, conversationId })
      } catch (error) {
        console.error('Error removing reaction:', error)
      }
    })

    // Heartbeat
    socket.on('heartbeat', async () => {
      try {
        await prisma.user.update({ where: { id: userId }, data: { lastActive: new Date() } })
      } catch (error) {
        console.error('Error updating lastActive:', error)
      }
    })

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (${socket.id})`)
      connectedUsers.delete(userId)

      try {
        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: false, lastActive: new Date() },
        })
      } catch (error) {
        console.error('Error setting user offline:', error)
      }

      typingUsers.forEach((users, conversationId) => {
        if (users.has(userId)) {
          users.delete(userId)
          socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', { userId, conversationId })
        }
      })

      socket.broadcast.emit('user_offline', { userId })
    })
  })

  return io
}

export const getConnectedUsers = () => connectedUsers
