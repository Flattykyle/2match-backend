import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { JwtPayload } from '../types'
import { getRedisClient } from '../config/redis'
import { logWarn } from './logger'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
// BEFORE: 24h access, 30d refresh — too long, tokens live forever if stolen
// AFTER: 15min access (httpOnly cookie), 7d refresh (Redis-bound, rotated on each use)
const JWT_ACCESS_EXPIRES_IN = '15m'
const JWT_REFRESH_EXPIRES_IN = '7d'
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days in seconds

/**
 * Generate access token (short-lived, 15min)
 */
export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  })
}

/**
 * Generate refresh token (7 days, stored in Redis with user binding)
 */
export const generateRefreshToken = (userId: string): string => {
  const tokenId = crypto.randomBytes(32).toString('hex')
  return jwt.sign({ userId, type: 'refresh', jti: tokenId }, JWT_SECRET, {
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
 * Store refresh token in Redis, bound to userId
 */
export const storeRefreshToken = async (userId: string, refreshToken: string): Promise<void> => {
  const redis = getRedisClient()
  if (!redis) {
    logWarn('Redis unavailable — refresh token not stored in Redis, falling back to DB only')
    return
  }
  // Key: refresh:<userId> = refreshToken
  await redis.set(`refresh:${userId}`, refreshToken, 'EX', REFRESH_TOKEN_TTL_SECONDS)
}

/**
 * Validate refresh token against Redis store
 */
export const validateRefreshToken = async (userId: string, refreshToken: string): Promise<boolean> => {
  const redis = getRedisClient()
  if (!redis) {
    return true // Fallback: skip Redis check if unavailable, DB check still applies
  }
  const stored = await redis.get(`refresh:${userId}`)
  return stored === refreshToken
}

/**
 * Revoke refresh token from Redis
 */
export const revokeRefreshToken = async (userId: string): Promise<void> => {
  const redis = getRedisClient()
  if (!redis) return
  await redis.del(`refresh:${userId}`)
}

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): JwtPayload & { type?: string; jti?: string } => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload & { type?: string; jti?: string }
}

/**
 * Generate random token for password reset
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Calculate token expiry date (7 days)
 */
export const getRefreshTokenExpiry = (): Date => {
  const date = new Date()
  // BEFORE: 30 days
  // AFTER: 7 days — matches JWT_REFRESH_EXPIRES_IN
  date.setDate(date.getDate() + 7)
  return date
}

/**
 * Calculate password reset token expiry (1 hour)
 */
export const getResetTokenExpiry = (): Date => {
  const date = new Date()
  date.setHours(date.getHours() + 1)
  return date
}

// Legacy support
export const generateToken = generateAccessToken
