import { Request, Response, NextFunction } from 'express'
import { accessLogger } from '../utils/logger'

/**
 * HTTP request logging middleware
 * Logs all incoming requests with timing information
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now()

  // Capture original end function
  const originalEnd = res.end

  // Override end function to log response
  res.end = function (chunk?: any, encoding?: any, callback?: any): any {
    // Restore original end
    res.end = originalEnd

    // Calculate response time
    const responseTime = Date.now() - startTime

    // Log the request
    accessLogger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: (req as any).userId || 'anonymous',
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      body: req.method !== 'GET' && req.body ? sanitizeBody(req.body) : undefined,
    })

    // Call original end
    return originalEnd.call(this, chunk, encoding, callback)
  }

  next()
}

/**
 * Sanitize request body to remove sensitive information from logs
 */
function sanitizeBody(body: any): any {
  if (typeof body !== 'object' || body === null) {
    return body
  }

  const sensitiveFields = [
    'password',
    'passwordConfirm',
    'currentPassword',
    'newPassword',
    'token',
    'refreshToken',
    'secret',
    'apiKey',
    'creditCard',
    'cvv',
    'ssn',
  ]

  const sanitized = { ...body }

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]'
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeBody(sanitized[key])
    }
  }

  return sanitized
}

/**
 * Skip logging for certain routes (health checks, static assets)
 */
export const shouldSkipLogging = (req: Request): boolean => {
  const skipPaths = ['/health', '/favicon.ico', '/robots.txt']

  return skipPaths.some((path) => req.path === path)
}

/**
 * Conditional request logger that skips certain routes
 */
export const conditionalRequestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (shouldSkipLogging(req)) {
    return next()
  }

  return requestLogger(req, res, next)
}
