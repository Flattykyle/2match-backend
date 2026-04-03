import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../utils/prisma'
import {
  generateTokenPair,
  generateResetToken,
  getRefreshTokenExpiry,
  getResetTokenExpiry,
  verifyToken,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
} from '../utils/jwt'
import { isValidEmail, getPasswordValidationError, isValidAge } from '../utils/validation'
import { AuthRequest, LoginDto, RegisterDto } from '../types'

const isProduction = process.env.NODE_ENV === 'production'

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS)
  res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
}

const clearAuthCookies = (res: Response) => {
  res.clearCookie('access_token', ACCESS_COOKIE_OPTIONS)
  res.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS)
}

export const register = async (req: Request, res: Response) => {
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
      interests,
    }: RegisterDto = req.body

    // Validate required fields
    if (!email || !password || !username || !firstName || !lastName || !dateOfBirth || !gender || !lookingFor) {
      return res.status(400).json({ error: 'All required fields must be provided' })
    }

    // Validate email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Validate password
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      return res.status(400).json({ error: passwordError })
    }

    // Validate age
    if (!isValidAge(new Date(dateOfBirth))) {
      return res.status(400).json({ error: 'You must be between 18 and 100 years old to register' })
    }

    // Check if email or username already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    })

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({ error: 'Email already registered' })
      }
      return res.status(409).json({ error: 'Username already taken' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
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
    })

    // Generate tokens with actual user ID
    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // Store refresh token in DB and Redis
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiry: getRefreshTokenExpiry(),
        },
      }),
      storeRefreshToken(user.id, refreshToken),
    ])

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken)

    // Return user without password (NO tokens in body)
    const { password: _, ...userWithoutPassword } = user

    return res.status(201).json({
      message: 'Registration successful',
      user: userWithoutPassword,
    })
  } catch (error) {
    console.error('Register error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, password }: LoginDto = req.body

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' })
    }

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // Store refresh token in DB and Redis
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiry: getRefreshTokenExpiry(),
        },
      }),
      storeRefreshToken(user.id, refreshToken),
    ])

    // Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken)

    // Return user without password
    const { password: _, ...userWithoutPassword } = user

    return res.status(200).json({
      message: 'Login successful',
      user: userWithoutPassword,
    })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        preferences: true,
        voiceIntroUrl: true,
        voiceIntroDuration: true,
        photoShieldEnabled: true,
        isOnline: true,
        lastActive: true,
        emailVerified: true,
        phoneVerified: true,
        photoVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.status(200).json({ user })
  } catch (error) {
    console.error('Get current user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refresh_token

    if (!token) {
      return res.status(401).json({ error: 'Refresh token not provided' })
    }

    // Verify JWT
    let decoded
    try {
      decoded = verifyToken(token)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    const userId = decoded.userId

    // Validate against Redis
    const isValid = await validateRefreshToken(userId, token)
    if (!isValid) {
      // Possible token reuse detected - revoke all tokens for this user
      await Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: { refreshToken: null, refreshTokenExpiry: null },
        }),
        revokeRefreshToken(userId),
      ])
      clearAuthCookies(res)
      return res.status(401).json({ error: 'Token reuse detected. All sessions revoked.' })
    }

    // Check DB match
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, refreshToken: true, refreshTokenExpiry: true },
    })

    if (!user || user.refreshToken !== token) {
      // Token reuse detected - revoke all
      if (user) {
        await Promise.all([
          prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null, refreshTokenExpiry: null },
          }),
          revokeRefreshToken(userId),
        ])
      }
      clearAuthCookies(res)
      return res.status(401).json({ error: 'Token reuse detected. All sessions revoked.' })
    }

    // Check expiry
    if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
      clearAuthCookies(res)
      return res.status(401).json({ error: 'Refresh token expired' })
    }

    // Rotate token pair
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair(userId)

    // Store new refresh token
    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: {
          refreshToken: newRefreshToken,
          refreshTokenExpiry: getRefreshTokenExpiry(),
        },
      }),
      storeRefreshToken(userId, newRefreshToken),
    ])

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken)

    return res.status(200).json({ message: 'Token refreshed successfully' })
  } catch (error) {
    console.error('Refresh token error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!

    // Clear DB and Redis
    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null, refreshTokenExpiry: null },
      }),
      revokeRefreshToken(userId),
    ])

    // Clear cookies
    clearAuthCookies(res)

    return res.status(200).json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent' })
    }

    // Generate reset token
    const resetToken = generateResetToken()

    // Store in DB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry: getResetTokenExpiry(),
      },
    })

    // Log reset link (in production, this would send an email)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`
    console.log(`Password reset link for ${email}: ${resetLink}`)

    return res.status(200).json({ message: 'If an account with that email exists, a reset link has been sent' })
  } catch (error) {
    console.error('Forgot password error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    // Validate password
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      return res.status(400).json({ error: passwordError })
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Update password, clear reset token, and revoke refresh tokens
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpiry: null,
          refreshToken: null,
          refreshTokenExpiry: null,
        },
      }),
      revokeRefreshToken(user.id),
    ])

    return res.status(200).json({ message: 'Password reset successfully' })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
