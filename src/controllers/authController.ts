import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AuthRequest, LoginDto, RegisterDto } from '../types'
import prisma from '../utils/prisma'
import {
  generateTokenPair,
  generateResetToken,
  getRefreshTokenExpiry,
  getResetTokenExpiry,
  verifyToken
} from '../utils/jwt'
import {
  isValidEmail,
  getPasswordValidationError,
  isValidAge
} from '../utils/validation'

// ----------------------------------------
// REGISTER
// ----------------------------------------
export const register = async (_req: Request, res: Response): Promise<void> => {
  try {
    const {
      email,
      password,
      username,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      lookingFor,
      bio,
      locationCity,
      locationCountry,
      latitude,
      longitude,
      hobbies,
      talents,
      interests
    }: RegisterDto = _req.body

    // Validate required fields
    if (!email || !password || !username || !firstName || !lastName || !dateOfBirth || !gender || !lookingFor) {
      res.status(400).json({
        message: 'Email, password, username, firstName, lastName, dateOfBirth, gender, and lookingFor are required'
      })
      return
    }

    // Validate email format
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email format' })
      return
    }

    // Validate password strength (min 8 chars, uppercase, lowercase, number)
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      res.status(400).json({ message: passwordError })
      return
    }

    // Validate age (must be 18+)
    const birthDate = new Date(dateOfBirth)
    if (!isValidAge(birthDate)) {
      res.status(400).json({ message: 'You must be at least 18 years old to register' })
      return
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      res.status(409).json({ message: 'User with this email already exists' })
      return
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({ where: { username } })
    if (existingUsername) {
      res.status(409).json({ message: 'Username already taken' })
      return
    }

    // Hash password with bcrypt (salt rounds = 12 for better security)
    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        firstName,
        lastName,
        dateOfBirth: new Date(dateOfBirth),
        gender,
        lookingFor,
        bio,
        locationCity,
        locationCountry,
        latitude,
        longitude,
        hobbies: hobbies || [],
        talents: talents || [],
        interests: interests || [],
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        lookingFor: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpiry: getRefreshTokenExpiry(),
      },
    })

    res.status(201).json({
      message: 'Registration successful',
      user,
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ message: 'Error creating user' })
  }
}

// ----------------------------------------
// LOGIN
// ----------------------------------------
export const login = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginDto = _req.body

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' })
      return
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    // Generate access and refresh tokens
    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken,
        refreshTokenExpiry: getRefreshTokenExpiry(),
        lastActive: new Date(),
      },
    })

    const { password: _, ...userWithoutPassword } = user

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Error logging in' })
  }
}

// ----------------------------------------
// GET CURRENT USER
// ----------------------------------------
export const getCurrentUser = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!_req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: _req.userId },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        lookingFor: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        createdAt: true,
        updatedAt: true,
        lastActive: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.json(user)
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ message: 'Error fetching user' })
  }
}

// ----------------------------------------
// REFRESH TOKEN
// ----------------------------------------
export const refreshToken = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const { refreshToken } = _req.body

    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required' })
      return
    }

    // Verify the refresh token
    let decoded
    try {
      decoded = verifyToken(refreshToken)
    } catch (error) {
      res.status(401).json({ message: 'Invalid or expired refresh token' })
      return
    }

    // Check if token type is refresh
    if (decoded.type !== 'refresh') {
      res.status(401).json({ message: 'Invalid token type' })
      return
    }

    // Find user and verify refresh token matches
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user || user.refreshToken !== refreshToken) {
      res.status(401).json({ message: 'Invalid refresh token' })
      return
    }

    // Check if refresh token is expired
    if (user.refreshTokenExpiry && new Date(user.refreshTokenExpiry) < new Date()) {
      res.status(401).json({ message: 'Refresh token expired' })
      return
    }

    // Generate new token pair
    const tokens = generateTokenPair(user.id)

    // Update refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: tokens.refreshToken,
        refreshTokenExpiry: getRefreshTokenExpiry(),
        lastActive: new Date(),
      },
    })

    res.json({
      message: 'Token refreshed successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(500).json({ message: 'Error refreshing token' })
  }
}

// ----------------------------------------
// LOGOUT
// ----------------------------------------
export const logout = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!_req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    // Invalidate refresh token
    await prisma.user.update({
      where: { id: _req.userId },
      data: {
        refreshToken: null,
        refreshTokenExpiry: null,
      },
    })

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ message: 'Error logging out' })
  }
}

// ----------------------------------------
// FORGOT PASSWORD
// ----------------------------------------
export const forgotPassword = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = _req.body

    if (!email) {
      res.status(400).json({ message: 'Email is required' })
      return
    }

    // Validate email format
    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email format' })
      return
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    })

    // Always return success message for security (don't reveal if email exists)
    if (!user) {
      res.json({
        message: 'If an account with that email exists, a password reset link has been sent',
      })
      return
    }

    // Generate reset token
    const resetToken = generateResetToken()
    const resetTokenExpiry = getResetTokenExpiry()

    // Save reset token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry: resetTokenExpiry,
      },
    })

    // TODO: Send email with reset link
    // For now, we'll just return the token (in production, this should be emailed)
    console.log(`Password reset token for ${email}: ${resetToken}`)
    console.log(`Reset link: http://localhost:5173/reset-password/${resetToken}`)

    res.json({
      message: 'If an account with that email exists, a password reset link has been sent',
      // TODO: Remove in production - only for testing
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ message: 'Error processing forgot password request' })
  }
}

// ----------------------------------------
// RESET PASSWORD
// ----------------------------------------
export const resetPassword = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token, newPassword } = _req.body

    if (!token || !newPassword) {
      res.status(400).json({ message: 'Token and new password are required' })
      return
    }

    // Validate password strength
    const passwordError = getPasswordValidationError(newPassword)
    if (passwordError) {
      res.status(400).json({ message: passwordError })
      return
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: {
          gt: new Date(), // Token must not be expired
        },
      },
    })

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired reset token' })
      return
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
        // Also invalidate all refresh tokens for security
        refreshToken: null,
        refreshTokenExpiry: null,
      },
    })

    res.json({ message: 'Password reset successfully. Please login with your new password.' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ message: 'Error resetting password' })
  }
}
