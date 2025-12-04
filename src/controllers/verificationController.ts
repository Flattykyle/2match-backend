import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import crypto from 'crypto'

// ----------------------------------------
// SEND EMAIL VERIFICATION
// ----------------------------------------
export const sendEmailVerification = async (
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
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.emailVerified) {
      res.status(400).json({ message: 'Email already verified' })
      return
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpiry: expiry,
      },
    })

    // TODO: Send email with verification link
    // For now, return the token for testing
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`

    res.json({
      message: 'Verification email sent',
      // Remove this in production - only for development
      verificationLink,
    })
  } catch (error) {
    console.error('Send email verification error:', error)
    res.status(500).json({ message: 'Error sending verification email' })
  }
}

// ----------------------------------------
// VERIFY EMAIL
// ----------------------------------------
export const verifyEmail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.body

    if (!token) {
      res.status(400).json({ message: 'Verification token is required' })
      return
    }

    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiry: {
          gt: new Date(),
        },
      },
    })

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired verification token' })
      return
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    })

    res.json({ message: 'Email verified successfully' })
  } catch (error) {
    console.error('Verify email error:', error)
    res.status(500).json({ message: 'Error verifying email' })
  }
}

// ----------------------------------------
// SEND PHONE VERIFICATION
// ----------------------------------------
export const sendPhoneVerification = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { phoneNumber } = req.body

    if (!phoneNumber) {
      res.status(400).json({ message: 'Phone number is required' })
      return
    }

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        phoneNumber,
        phoneVerificationToken: code,
        phoneVerified: false,
      },
    })

    // TODO: Send SMS with verification code using Twilio or similar
    // For now, return the code for testing

    res.json({
      message: 'Verification code sent to phone',
      // Remove this in production - only for development
      verificationCode: code,
    })
  } catch (error) {
    console.error('Send phone verification error:', error)
    res.status(500).json({ message: 'Error sending phone verification' })
  }
}

// ----------------------------------------
// VERIFY PHONE
// ----------------------------------------
export const verifyPhone = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { code } = req.body

    if (!code) {
      res.status(400).json({ message: 'Verification code is required' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.phoneVerificationToken !== code) {
      res.status(400).json({ message: 'Invalid verification code' })
      return
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        phoneVerified: true,
        phoneVerificationToken: null,
      },
    })

    res.json({ message: 'Phone verified successfully' })
  } catch (error) {
    console.error('Verify phone error:', error)
    res.status(500).json({ message: 'Error verifying phone' })
  }
}

// ----------------------------------------
// SUBMIT PHOTO VERIFICATION
// ----------------------------------------
export const submitPhotoVerification = async (
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
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.photoVerified) {
      res.status(400).json({ message: 'Photo already verified' })
      return
    }

    // Update photo verification status to pending
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        photoVerificationStatus: 'pending',
        photoVerificationSubmittedAt: new Date(),
      },
    })

    res.json({
      message: 'Photo verification submitted. We will review it shortly.',
    })
  } catch (error) {
    console.error('Submit photo verification error:', error)
    res.status(500).json({ message: 'Error submitting photo verification' })
  }
}

// ----------------------------------------
// GET VERIFICATION STATUS
// ----------------------------------------
export const getVerificationStatus = async (
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
      select: {
        emailVerified: true,
        phoneVerified: true,
        phoneNumber: true,
        photoVerified: true,
        photoVerificationStatus: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json(user)
  } catch (error) {
    console.error('Get verification status error:', error)
    res.status(500).json({ message: 'Error fetching verification status' })
  }
}
