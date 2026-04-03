import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { uploadAudioToCloudinary, deleteResourceFromCloudinary } from '../utils/cloudinary'
import { getSocketIO } from '../socket/socket'

// ----------------------------------------
// UPLOAD PROFILE VOICE MEMO
// POST /api/voice-memo/profile
// ----------------------------------------
export const uploadProfileVoiceMemo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' })
      return
    }

    if (req.file.buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Audio file too large. Maximum 2MB.' })
      return
    }

    // Upload to Cloudinary
    const { url, duration } = await uploadAudioToCloudinary(req.file.buffer, 'voice-memos')

    // Enforce max 45 seconds
    if (duration > 45) {
      try { await deleteResourceFromCloudinary(url, 'video') } catch {}
      res.status(400).json({ error: 'Voice memo must be 45 seconds or less.' })
      return
    }

    // Extract publicId from URL
    const urlParts = url.split('/')
    const publicIdWithExt = urlParts.slice(-2).join('/')
    const publicId = publicIdWithExt.split('.')[0]

    // Delete existing voice memo if present
    const existingMemo = await prisma.voiceMemo.findUnique({
      where: { userId: req.userId },
    })
    if (existingMemo) {
      try { await deleteResourceFromCloudinary(existingMemo.url, 'video') } catch {}
    }

    // Upsert VoiceMemo record
    const voiceMemo = await prisma.voiceMemo.upsert({
      where: { userId: req.userId },
      update: {
        url,
        duration,
        cloudinaryPublicId: publicId,
      },
      create: {
        userId: req.userId,
        url,
        duration,
        cloudinaryPublicId: publicId,
      },
    })

    // Patch User.voiceMemoId
    await prisma.user.update({
      where: { id: req.userId },
      data: { voiceMemoId: voiceMemo.id },
    })

    res.status(201).json({ url, duration })
  } catch (error) {
    console.error('Upload profile voice memo error:', error)
    res.status(500).json({ error: 'Error uploading voice memo' })
  }
}

// ----------------------------------------
// DELETE PROFILE VOICE MEMO
// DELETE /api/voice-memo/profile
// ----------------------------------------
export const deleteProfileVoiceMemo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const memo = await prisma.voiceMemo.findUnique({
      where: { userId: req.userId },
    })

    if (!memo) {
      res.status(404).json({ error: 'No voice memo to delete' })
      return
    }

    // Delete from Cloudinary
    try { await deleteResourceFromCloudinary(memo.url, 'video') } catch {}

    // Remove VoiceMemo record
    await prisma.voiceMemo.delete({ where: { id: memo.id } })

    // Clear User.voiceMemoId
    await prisma.user.update({
      where: { id: req.userId },
      data: { voiceMemoId: null },
    })

    res.json({ message: 'Voice memo deleted' })
  } catch (error) {
    console.error('Delete profile voice memo error:', error)
    res.status(500).json({ error: 'Error deleting voice memo' })
  }
}

// ----------------------------------------
// SEND CHAT VOICE MESSAGE
// POST /api/messages/:matchId/voice
// ----------------------------------------
export const sendVoiceMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' })
      return
    }

    const { matchId } = req.params
    const userId = req.userId

    // Verify user is part of this match
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: userId }, { userId2: userId }],
      },
    })

    if (!match) {
      res.status(404).json({ error: 'Match not found' })
      return
    }

    // Slow Burn gate
    if (match.slowBurnEnabled && !match.chatUnlocked) {
      res.status(403).json({
        error: 'Chat locked',
        exchangeCount: match.exchangeCount,
        required: 3,
      })
      return
    }

    const receiverId = match.userId1 === userId ? match.userId2 : match.userId1

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: receiverId },
          { user1Id: receiverId, user2Id: userId },
        ],
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { user1Id: userId, user2Id: receiverId },
      })
    }

    // Upload to Cloudinary
    const { url: audioUrl, duration } = await uploadAudioToCloudinary(req.file.buffer, 'voice-memos')

    // Enforce max 60 seconds for chat
    if (duration > 60) {
      try { await deleteResourceFromCloudinary(audioUrl, 'video') } catch {}
      res.status(400).json({ error: 'Voice message must be 60 seconds or less.' })
      return
    }

    // Create message with type VOICE
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId,
        conversationId: conversation.id,
        content: 'Voice message',
        type: 'VOICE',
        audioUrl,
        audioDuration: duration,
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
          select: { id: true, userId: true, emoji: true },
        },
      },
    })

    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    })

    // Emit via Socket.IO
    const io = getSocketIO()
    if (io) {
      io.to(`conversation:${conversation.id}`).emit('new_message', message)
    }

    res.status(201).json({ message })
  } catch (error) {
    console.error('Send voice message error:', error)
    res.status(500).json({ error: 'Error sending voice message' })
  }
}
