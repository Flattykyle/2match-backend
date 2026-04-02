import { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'

/**
 * Helmet.js configuration for HTTP security headers
 * Helps protect against common web vulnerabilities
 */
export const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Cross-Origin policies
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },

  // Strict-Transport-Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options
  ieNoOpen: true,

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
})

/**
 * MongoDB injection protection
 * Sanitizes user input to prevent NoSQL injection attacks
 */
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️  Sanitized key "${key}" in request from ${req.ip}`)
  },
})

/**
 * HTTP Parameter Pollution protection
 * Prevents duplicate parameter attacks
 */
export const hppProtection = hpp({
  whitelist: [
    'page',
    'limit',
    'sort',
    'minAge',
    'maxAge',
    'gender',
    'interests',
    'lookingFor',
  ],
})

/**
 * XSS (Cross-Site Scripting) protection middleware
 * Sanitizes HTML and script tags from user input
 */
export const xssProtection = (req: Request, _res: Response, next: NextFunction) => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      // Remove script tags and event handlers
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '')
    }

    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue)
      }

      const sanitized: any = {}
      for (const key in value) {
        sanitized[key] = sanitizeValue(value[key])
      }
      return sanitized
    }

    return value
  }

  if (req.body) {
    req.body = sanitizeValue(req.body)
  }

  if (req.query) {
    req.query = sanitizeValue(req.query)
  }

  if (req.params) {
    req.params = sanitizeValue(req.params)
  }

  next()
}

/**
 * Request size limit middleware
 * Prevents large payload attacks
 */
export const requestSizeLimit = {
  json: { limit: '10mb' },
  urlencoded: { extended: true, limit: '10mb' },
}

/**
 * Security headers middleware for additional protection
 */
export const securityHeaders = (_req: Request, _res: Response, next: NextFunction) => {
  // Remove X-Powered-By header (handled by helmet)
  // res.removeHeader('X-Powered-By')

  // Custom security headers are handled by helmet
  // Keeping this middleware for any future custom headers
  next()
}

/**
 * Secure cookie configuration for production
 */
export const cookieConfig = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

/**
 * CORS configuration for production
 */
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173']

    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true)
    }

    // In development, allow any origin from local network
    if (process.env.NODE_ENV !== 'production') {
      // Allow localhost and local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (
        origin.includes('localhost') ||
        origin.match(/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i)
      ) {
        return callback(null, true)
      }
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}
