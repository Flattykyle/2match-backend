import Redis from 'ioredis'
import { logInfo, logError, logWarn } from '../utils/logger'

/**
 * Redis client instance
 */
let redisClient: Redis | null = null

/**
 * Initialize Redis client
 */
export const initializeRedis = (): Redis | null => {
  // Skip Redis if not configured
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    logWarn('Redis not configured. Caching will be disabled.')
    return null
  }

  try {
    // Create Redis client
    if (process.env.REDIS_URL) {
      // Use connection URL if provided
      redisClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000)
          return delay
        },
        maxRetriesPerRequest: 3,
      })
    } else {
      // Use individual connection parameters
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000)
          return delay
        },
        maxRetriesPerRequest: 3,
      })
    }

    // Connection events
    redisClient.on('connect', () => {
      logInfo('Redis client connected')
    })

    redisClient.on('ready', () => {
      logInfo('Redis client ready to use')
    })

    redisClient.on('error', (err) => {
      logError('Redis client error', err)
    })

    redisClient.on('close', () => {
      logWarn('Redis connection closed')
    })

    redisClient.on('reconnecting', () => {
      logWarn('Redis client reconnecting')
    })

    return redisClient
  } catch (error) {
    logError('Failed to initialize Redis', error)
    return null
  }
}

/**
 * Get Redis client instance
 */
export const getRedisClient = (): Redis | null => {
  return redisClient
}

/**
 * Check if Redis is available
 */
export const isRedisAvailable = (): boolean => {
  return redisClient !== null && redisClient.status === 'ready'
}

/**
 * Close Redis connection
 */
export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit()
      logInfo('Redis connection closed gracefully')
    } catch (error) {
      logError('Error closing Redis connection', error)
    }
  }
}

/**
 * Flush all Redis data (use with caution!)
 */
export const flushRedis = async (): Promise<void> => {
  if (redisClient && isRedisAvailable()) {
    try {
      await redisClient.flushdb()
      logInfo('Redis database flushed')
    } catch (error) {
      logError('Error flushing Redis', error)
    }
  }
}

/**
 * Get Redis info
 */
export const getRedisInfo = async (): Promise<string | null> => {
  if (redisClient && isRedisAvailable()) {
    try {
      return await redisClient.info()
    } catch (error) {
      logError('Error getting Redis info', error)
      return null
    }
  }
  return null
}
