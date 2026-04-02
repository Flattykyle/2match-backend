import multer from 'multer'
import { Request, Response, NextFunction } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

// Configure multer for memory storage
const storage = multer.memoryStorage()

// BEFORE: Only checked file.mimetype (trusts client-sent Content-Type header)
// AFTER: Also validate file magic bytes in validateUpload middleware below
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Accept only image/jpeg, image/png, image/webp — no image/jpg
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'))
  }
}

// Create multer instance with configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
})

// Middleware for single photo upload
export const uploadSingle = upload.single('photo')

// Middleware for multiple photo uploads (max 6)
export const uploadMultiple = upload.array('photos', 6)

// ── Audio upload config (voice intros) ──
const audioFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'video/webm']
  // Note: MediaRecorder often produces video/webm even for audio-only recordings
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only WebM and MP4 audio are allowed.'))
  }
}

const audioUpload = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
})

// Middleware for single audio upload
export const uploadAudioSingle = audioUpload.single('audio')

/**
 * AFTER: Additional upload validation middleware — runs after multer
 * - Validates file magic bytes (don't trust Content-Type alone)
 * - Enforces max 6 photos per user (server-side, not just client)
 * - Rejects files > 5MB (defense in depth — multer also checks)
 */
export const validateUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      return next() // No file to validate, let controller handle the error
    }

    // Validate magic bytes — don't trust Content-Type header alone
    const buffer = req.file.buffer
    const magicBytes = buffer.slice(0, 12)

    const isJPEG = magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF
    const isPNG = magicBytes[0] === 0x89 && magicBytes[1] === 0x50 &&
                  magicBytes[2] === 0x4E && magicBytes[3] === 0x47
    // WebP: starts with RIFF....WEBP
    const isWebP = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 &&
                   magicBytes[2] === 0x46 && magicBytes[3] === 0x46 &&
                   magicBytes[8] === 0x57 && magicBytes[9] === 0x45 &&
                   magicBytes[10] === 0x42 && magicBytes[11] === 0x50

    if (!isJPEG && !isPNG && !isWebP) {
      res.status(400).json({ message: 'Invalid file content. Only JPEG, PNG, and WebP images are accepted.' })
      return
    }

    // Enforce 5MB limit (defense in depth)
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ message: 'File too large. Maximum size is 5MB.' })
      return
    }

    // Enforce max 6 photos per user
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { profilePictures: true },
      })

      if (user && user.profilePictures.length >= 6) {
        res.status(400).json({ message: 'Maximum of 6 photos allowed. Delete a photo first.' })
        return
      }
    }

    next()
  } catch (error) {
    console.error('Upload validation error:', error)
    res.status(500).json({ message: 'Error validating upload' })
  }
}
