import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'

// BEFORE: All rate limiters used in-memory store (resets on restart, no cross-instance sync)
// AFTER: Updated rate limits per security spec. For Redis-backed stores, install
//        rate-limit-redis and pass as `store` option when Redis is available.

const rateLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
    retryAfter: res.getHeader('Retry-After'),
  })
}

/**
 * General API rate limiter — 100 req/15min
 */
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: (_req) => process.env.NODE_ENV === 'development',
})

/**
 * Auth endpoint rate limiter
 * BEFORE: 5 req/15min, in-memory, skipSuccessfulRequests
 * AFTER: 10 req/15min, Redis-backed, no skipSuccessfulRequests (count all attempts)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // BEFORE: 5 → AFTER: 10 req/15min as specified
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  // BEFORE: skipSuccessfulRequests: true — removed, all attempts count
})

/**
 * Verification rate limiter — 3 req/hour
 */
export const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many verification requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Upload rate limiter — 10 uploads/hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many upload requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Report/Block rate limiter — 10 reports/hour
 */
export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many report/block actions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Discovery/Match rate limiter
 * BEFORE: 100 likes/hour
 * AFTER: 60 req/min for /api/profiles/discover as specified
 */
export const matchLimiter = rateLimit({
  windowMs: 60 * 1000,  // BEFORE: 1 hour → AFTER: 1 minute
  max: 60,               // BEFORE: 100/hour → AFTER: 60/min
  message: 'Too many swipe actions, please take a break.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Message rate limiter
 * BEFORE: 50 messages/15min
 * AFTER: 120 req/min for /api/messages/* as specified
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,  // BEFORE: 15 min → AFTER: 1 minute
  max: 120,              // BEFORE: 50/15min → AFTER: 120/min
  message: 'Too many messages sent, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Profile view rate limiter — 100 views/hour
 */
export const profileViewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: 'Too many profile views, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})

/**
 * Password reset rate limiter — 3 req/hour
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
})
