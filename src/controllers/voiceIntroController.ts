import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { uploadAudioToCloudinary, deleteResourceFromCloudinary } from '../utils/cloudinary'

const MAX_DURATION_SECONDS = 30

// ----------------------------------------
// UPLOAD VOICE INTRO
// POST /api/users/me/voice-intro
// ----------------------------------------
export const uploadVoiceIntro = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    if (!req.file) {
      res.status(400).json({ message: 'No audio file uploaded' })
      return
    }

    // Enforce 2MB
    if (req.file.buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ message: 'Audio file too large. Maximum 2MB.' })
      return
    }

    // Delete existing voice intro from Cloudinary if present
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { voiceIntroUrl: true },
    })

    if (currentUser?.voiceIntroUrl) {
      try {
        await deleteResourceFromCloudinary(currentUser.voiceIntroUrl, 'video')
      } catch {
        // Non-fatal — old file cleanup failed, continue with new upload
      }
    }

    // Upload to Cloudinary under /voice-intros/
    const { url, duration } = await uploadAudioToCloudinary(req.file.buffer, 'voice-intros')

    // Enforce max 30 seconds (Cloudinary reports duration)
    if (duration > MAX_DURATION_SECONDS) {
      // Delete the just-uploaded file
      try {
        await deleteResourceFromCloudinary(url, 'video')
      } catch { /* ignore */ }

      res.status(400).json({ message: `Voice intro must be ${MAX_DURATION_SECONDS} seconds or less.` })
      return
    }

    // Store on user model
    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: {
        voiceIntroUrl: url,
        voiceIntroDuration: duration,
      },
      select: {
        voiceIntroUrl: true,
        voiceIntroDuration: true,
      },
    })

    res.status(201).json({
      message: 'Voice intro uploaded',
      voiceIntroUrl: updatedUser.voiceIntroUrl,
      voiceIntroDuration: updatedUser.voiceIntroDuration,
    })
  } catch (error) {
    console.error('Upload voice intro error:', error)
    res.status(500).json({ message: 'Error uploading voice intro' })
  }
}

// ----------------------------------------
// DELETE VOICE INTRO
// DELETE /api/users/me/voice-intro
// ----------------------------------------
export const deleteVoiceIntro = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { voiceIntroUrl: true },
    })

    if (!user?.voiceIntroUrl) {
      res.status(404).json({ message: 'No voice intro to delete' })
      return
    }

    // Delete from Cloudinary
    try {
      await deleteResourceFromCloudinary(user.voiceIntroUrl, 'video')
    } catch {
      // Non-fatal
    }

    // Clear from user model
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        voiceIntroUrl: null,
        voiceIntroDuration: null,
      },
    })

    res.json({ message: 'Voice intro deleted' })
  } catch (error) {
    console.error('Delete voice intro error:', error)
    res.status(500).json({ message: 'Error deleting voice intro' })
  }
}
