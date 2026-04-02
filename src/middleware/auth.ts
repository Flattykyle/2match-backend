import { NextFunction, Response } from 'express'
import { AuthRequest } from '../types'
import { verifyToken } from '../utils/jwt'

/**
 * Middleware to authenticate requests using JWT access tokens
 * BEFORE: Read token from Authorization: Bearer <token> header (localStorage on frontend)
 * AFTER: Read token from httpOnly cookie "access_token" — immune to XSS theft
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // BEFORE: const authHeader = req.headers.authorization; token = authHeader.split(' ')[1]
    // AFTER: Read from httpOnly cookie
    const token = req.cookies?.access_token

    if (!token) {
      return res.status(401).json({
        message: 'No token provided',
        code: 'NO_TOKEN',
      })
    }

    // Verify and decode token
    let decoded
    try {
      decoded = verifyToken(token)
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Access token expired',
          code: 'TOKEN_EXPIRED',
        })
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
        })
      }
      throw error
    }

    // Ensure this is an access token, not a refresh token
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        message: 'Invalid token type. Please use an access token.',
        code: 'INVALID_TOKEN_TYPE',
      })
    }

    // Attach userId to request
    req.userId = decoded.userId

    return next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return res.status(401).json({
      message: 'Authentication failed',
      code: 'AUTH_FAILED',
    })
  }
}
