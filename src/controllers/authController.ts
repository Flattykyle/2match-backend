import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { AuthRequest, LoginDto, RegisterDto } from '../types'
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
import {
  isValidEmail,
  getPasswordValidationError,
  isValidAge
} from '../utils/validation'

// BEFORE: Tokens returned in JSON body, stored in localStorage on frontend
// AFTER: Access token in httpOnly cookie (15min), refresh token in httpOnly cookie (7d) + Redis
const isProduction = process.env.NODE_ENV === 'production'

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' as const : 'lax' as const,
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 minutes
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' as const : 'lax' as const,
  path: '/api/auth', // Only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

/** Helper: set auth cookies on response */
const setAuthCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTIONS)
  res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS)
}

/** Helper: clear auth cookies on response */
const clearAuthCookies = (res: Response) => {
  res.clearCookie('access_token', { path: '/' })
  res.clearCookie('refresh_token', { path: '/api/auth' })
}

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

    if (!isValidEmail(email)) {
      res.status(400).json({ message: 'Invalid email format' })
      return
    }

    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      res.status(400).json({ message: passwordError })
      return
    }

    const birthDate = new Date(dateOfBirth)
    if (!isValidAge(birthDate)) {
      res.status(400).json({ message: 'You must be at least 18 years old to register' })
      return
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      res.status(409).json({ message: 'User with this email already exists' })
      return
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } })
    if (existingUsername) {
      res.status(409).json({ message: 'Username already taken' })
      return
    }

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

    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // BEFORE: Store refresh token in DB only
    // AFTER: Store in both DB (fallback) and Redis (primary, with TTL)
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { refreshToken, refreshTokenExpiry: getRefreshTokenExpiry() },
      }),
      storeRefreshToken(user.id, refreshToken),
    ])

    // BEFORE: res.json({ accessToken, refreshToken }) — tokens in response body
    // AFTER: Set httpOnly cookies — JS cannot access these tokens
    setAuthCookies(res, accessToken, refreshToken)

    res.status(201).json({
      message: 'Registration successful',
      user,
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
    const { identifier, password }: LoginDto = _req.body

    if (!identifier || !password) {
      res.status(400).json({ message: 'Email/username and password are required' })
      return
    }

    const isEmail = identifier.includes('@')

    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { username: identifier } })

    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials' })
      return
    }

    const { accessToken, refreshToken } = generateTokenPair(user.id)

    // BEFORE: Store refresh token in DB only
    // AFTER: Store in both DB and Redis
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken,
          refreshTokenExpiry: getRefreshTokenExpiry(),
          lastActive: new Date(),
        },
      }),
      storeRefreshToken(user.id, refreshToken),
    ])

    const { password: _, ...userWithoutPassword } = user

    // BEFORE: res.json({ accessToken, refreshToken }) — tokens in response body
    // AFTER: Set httpOnly cookies
    setAuthCookies(res, accessToken, refreshToken)

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
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
// REFRESH TOKEN (POST /auth/refresh)
// BEFORE: Reads refreshToken from request body, returns new tokens in body
// AFTER: Reads refreshToken from httpOnly cookie, validates against Redis,
//        rotates token (old one invalidated), sets new cookies
// ----------------------------------------
export const refreshToken = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // BEFORE: const { refreshToken } = _req.body
    // AFTER: Read from httpOnly cookie
    const incomingRefreshToken = _req.cookies?.refresh_token

    if (!incomingRefreshToken) {
      res.status(401).json({ message: 'No refresh token provided' })
      return
    }

    // Verify the refresh token JWT
    let decoded
    try {
      decoded = verifyToken(incomingRefreshToken)
    } catch (error) {
      clearAuthCookies(res)
      res.status(401).json({ message: 'Invalid or expired refresh token' })
      return
    }

    if (decoded.type !== 'refresh') {
      clearAuthCookies(res)
      res.status(401).json({ message: 'Invalid token type' })
      return
    }

    // BEFORE: Only checked DB for refresh token match
    // AFTER: Check Redis first (primary), then DB (fallback) — detect token reuse
    const isValidInRedis = await validateRefreshToken(decoded.userId, incomingRefreshToken)

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user || user.refreshToken !== incomingRefreshToken) {
      // Possible token reuse attack — revoke all sessions for this user
      if (user) {
        await Promise.all([
          prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: null, refreshTokenExpiry: null },
          }),
          revokeRefreshToken(user.id),
        ])
      }
      clearAuthCookies(res)
      res.status(401).json({ message: 'Invalid refresh token — session revoked' })
      return
    }

    if (!isValidInRedis) {
      clearAuthCookies(res)
      res.status(401).json({ message: 'Refresh token revoked' })
      return
    }

    if (user.refreshTokenExpiry && new Date(user.refreshTokenExpiry) < new Date()) {
      clearAuthCookies(res)
      res.status(401).json({ message: 'Refresh token expired' })
      return
    }

    // ROTATION: Generate new token pair, invalidate old refresh token
    const tokens = generateTokenPair(user.id)

    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: tokens.refreshToken,
          refreshTokenExpiry: getRefreshTokenExpiry(),
          lastActive: new Date(),
        },
      }),
      storeRefreshToken(user.id, tokens.refreshToken),
    ])

    // BEFORE: res.json({ accessToken, refreshToken }) — tokens in body
    // AFTER: Set new httpOnly cookies
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken)

    res.json({ message: 'Token refreshed successfully' })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(500).json({ message: 'Error refreshing token' })
  }
}

// ----------------------------------------
// LOGOUT (POST /auth/logout)
// BEFORE: Only cleared refresh token from DB
// AFTER: Clear from Redis + DB + clear httpOnly cookies
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

    // BEFORE: Only cleared DB
    // AFTER: Revoke from Redis + DB + clear cookies
    await Promise.all([
      prisma.user.update({
        where: { id: _req.userId },
        data: { refreshToken: null, refreshTokenExpiry: null },
      }),
      revokeRefreshToken(_req.userId),
    ])

    clearAuthCookies(res)

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

    // Update password and clear reset token + revoke refresh tokens everywhere
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

    res.json({ message: 'Password reset successfully. Please login with your new password.' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ message: 'Error resetting password' })
  }
}
