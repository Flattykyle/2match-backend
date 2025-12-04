import * as Sentry from '@sentry/node'
import { Express } from 'express'
import logger from '../utils/logger'

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
export const initializeSentry = (_app: Express) => {
  // Only initialize Sentry if DSN is provided
  if (!process.env.SENTRY_DSN) {
    logger.warn('Sentry DSN not provided. Error tracking disabled.')
    return
  }

  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Set sample rate for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Capture unhandled promise rejections
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],

    // Ignore certain errors
    ignoreErrors: [
      'ECONNRESET',
      'EPIPE',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'Unauthorized',
      'Not Found',
    ],

    // Before sending to Sentry, filter out sensitive data
    beforeSend(event, _hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }

      // Remove sensitive data from event contexts
      if (event.contexts?.user) {
        delete event.contexts.user.password
      }

      // Log that error was sent to Sentry
      logger.info('Error sent to Sentry', {
        eventId: event.event_id,
        level: event.level,
      })

      return event
    },
  })

  logger.info('Sentry initialized', {
    environment: process.env.NODE_ENV,
    sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  })
}

/**
 * Sentry request handler middleware (must be first)
 * Note: In Sentry v8+, request handling is done automatically by expressIntegration
 */
export const sentryRequestHandler = () => {
  // Request handling is now done automatically by expressIntegration
  return (_req: any, _res: any, next: any) => next()
}

/**
 * Sentry tracing middleware
 * Note: In Sentry v8+, tracing is handled automatically by expressIntegration
 */
export const sentryTracingHandler = () => {
  // Tracing is now handled automatically by expressIntegration
  return (_req: any, _res: any, next: any) => next()
}

/**
 * Sentry error handler middleware (must be before other error handlers)
 */
export const sentryErrorHandler = () => {
  if (!process.env.SENTRY_DSN) {
    return (_err: any, _req: any, _res: any, next: any) => next()
  }

  // Return a middleware function that captures errors
  return (error: Error, _req: any, _res: any, next: any) => {
    // Only send errors with status >= 500 to Sentry
    const shouldHandle = (error as any).status ? (error as any).status >= 500 : true

    if (shouldHandle) {
      Sentry.captureException(error)
    }

    // Continue to next error handler
    next(error)
  }
}

/**
 * Manually capture exception to Sentry
 */
export const captureException = (error: Error, context?: any) => {
  if (!process.env.SENTRY_DSN) {
    logger.error('Error occurred (Sentry disabled)', { error: error.message, context })
    return
  }

  Sentry.captureException(error, {
    contexts: context ? { custom: context } : undefined,
  })
}

/**
 * Manually capture message to Sentry
 */
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  if (!process.env.SENTRY_DSN) {
    logger.info('Message (Sentry disabled)', { message, level })
    return
  }

  Sentry.captureMessage(message, level)
}

/**
 * Set user context for Sentry
 */
export const setUserContext = (userId: string, email?: string, username?: string) => {
  if (!process.env.SENTRY_DSN) return

  Sentry.setUser({
    id: userId,
    email,
    username,
  })
}

/**
 * Clear user context
 */
export const clearUserContext = () => {
  if (!process.env.SENTRY_DSN) return
  Sentry.setUser(null)
}
