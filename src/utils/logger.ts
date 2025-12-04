import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'

/**
 * Custom log format with timestamp, level, and message
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

/**
 * Console format for development (colorized and human-readable)
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`
    }

    return msg
  })
)

/**
 * Create logs directory if it doesn't exist
 */
const logsDir = path.join(process.cwd(), 'logs')

/**
 * Daily rotate file transport for error logs
 */
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d', // Keep logs for 14 days
  format: logFormat,
})

/**
 * Daily rotate file transport for combined logs
 */
const combinedFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d', // Keep logs for 7 days
  format: logFormat,
})

/**
 * Daily rotate file transport for HTTP access logs
 */
const accessFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d',
  format: logFormat,
})

/**
 * Winston logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: '2-match-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    // Always log errors to file
    errorFileRotateTransport,
  ],
})

/**
 * Add console transport in development or if explicitly enabled
 */
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  )
}

/**
 * Add file transports in production
 */
if (process.env.NODE_ENV === 'production') {
  logger.add(combinedFileRotateTransport)
}

/**
 * Access logger for HTTP requests (separate instance)
 */
export const accessLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: '2-match-access',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [accessFileRotateTransport],
})

/**
 * Log levels:
 * - error: 0
 * - warn: 1
 * - info: 2
 * - http: 3
 * - verbose: 4
 * - debug: 5
 * - silly: 6
 */

/**
 * Helper functions for structured logging
 */
export const logError = (message: string, error?: any, meta?: any) => {
  logger.error(message, {
    error: error?.message || error,
    stack: error?.stack,
    ...meta,
  })
}

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta)
}

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta)
}

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta)
}

export const logHttp = (message: string, meta?: any) => {
  logger.http(message, meta)
}

/**
 * Create logs directory on startup
 */
import fs from 'fs'
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
  logger.info('Created logs directory', { path: logsDir })
}

export default logger
