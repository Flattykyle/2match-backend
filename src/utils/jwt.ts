import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { JwtPayload } from '../types'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_ACCESS_EXPIRES_IN = '24h' // Access token expires in 24 hours
const JWT_REFRESH_EXPIRES_IN = '30d' // Refresh token expires in 30 days

/**
 * Generate access token (short-lived)
 */
export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  })
}

/**
 * Generate refresh token (long-lived)
 */
export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  })
}

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (userId: string) => {
  return {
    accessToken: generateAccessToken(userId),
    refreshToken: generateRefreshToken(userId),
  }
}

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): JwtPayload & { type?: string } => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload & { type?: string }
}

/**
 * Generate random token for password reset
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Calculate token expiry date
 */
export const getRefreshTokenExpiry = (): Date => {
  const date = new Date()
  date.setDate(date.getDate() + 30) // 30 days from now
  return date
}

/**
 * Calculate password reset token expiry (1 hour)
 */
export const getResetTokenExpiry = (): Date => {
  const date = new Date()
  date.setHours(date.getHours() + 1) // 1 hour from now
  return date
}

// Legacy support - keep for backward compatibility
export const generateToken = generateAccessToken
