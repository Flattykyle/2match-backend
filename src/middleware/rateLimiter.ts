import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'

/**
 * Rate limit handler
 * Sends a consistent error message when rate limit is exceeded
 */
const rateLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
    retryAfter: res.getHeader('Retry-After'),
  })
}

/**
 * General API rate limiter
 * Applies to all API endpoints
 * Default: 100 requests per 15 minutes
 */
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (_req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development'
  },
})

/**
 * Authentication endpoint rate limiter
 * Stricter limits for login, register, password reset
 * Default: 5 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true, // Don't count successful logins
})

/**
 * Email/SMS verification rate limiter
 * Prevents spam of verification codes
 * Default: 3 requests per hour
 */
export const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many verification requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Upload endpoint rate limiter
 * Limits file uploads to prevent abuse
 * Default: 10 uploads per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many upload requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Report/Block action rate limiter
 * Prevents spam reporting
 * Default: 10 reports per hour
 */
export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many report/block actions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Match/Like action rate limiter
 * Prevents rapid swiping abuse
 * Default: 100 likes per hour
 */
export const matchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many swipe actions, please take a break.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Message sending rate limiter
 * Prevents message spam
 * Default: 50 messages per 15 minutes
 */
export const messageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many messages sent, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Profile view tracking rate limiter
 * Prevents profile view spam
 * Default: 100 views per hour
 */
export const profileViewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many profile views, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Password reset rate limiter
 * Prevents password reset spam
 * Default: 3 requests per hour
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})
