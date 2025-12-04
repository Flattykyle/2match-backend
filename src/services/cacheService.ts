import { getRedisClient, isRedisAvailable } from '../config/redis'
import { logDebug, logError } from '../utils/logger'

/**
 * Default TTL (Time To Live) in seconds
 */
const DEFAULT_TTL = parseInt(process.env.REDIS_TTL || '3600') // 1 hour

/**
 * Cache key prefixes for different data types
 */
export const CACHE_KEYS = {
  USER_PROFILE: 'user:profile:',
  USER_SESSION: 'user:session:',
  POTENTIAL_MATCHES: 'matches:potential:',
  MATCH_SCORE: 'matches:score:',
  ONLINE_STATUS: 'user:online:',
  PROFILE_VIEWS: 'profile:views:',
  BLOCKED_USERS: 'user:blocked:',
  VERIFICATION_CODE: 'verification:code:',
} as const

/**
 * Get data from cache
 */
export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!isRedisAvailable()) {
    return null
  }

  try {
    const redis = getRedisClient()
    if (!redis) return null

    const data = await redis.get(key)

    if (!data) {
      logDebug('Cache miss', { key })
      return null
    }

    logDebug('Cache hit', { key })
    return JSON.parse(data) as T
  } catch (error) {
    logError('Cache get error', error, { key })
    return null
  }
}

/**
 * Set data in cache with TTL
 */
export const setCache = async (
  key: string,
  value: any,
  ttl: number = DEFAULT_TTL
): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    await redis.setex(key, ttl, JSON.stringify(value))
    logDebug('Cache set', { key, ttl })
    return true
  } catch (error) {
    logError('Cache set error', error, { key })
    return false
  }
}

/**
 * Delete data from cache
 */
export const deleteCache = async (key: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    await redis.del(key)
    logDebug('Cache deleted', { key })
    return true
  } catch (error) {
    logError('Cache delete error', error, { key })
    return false
  }
}

/**
 * Delete multiple cache keys by pattern
 */
export const deleteCachePattern = async (pattern: string): Promise<number> => {
  if (!isRedisAvailable()) {
    return 0
  }

  try {
    const redis = getRedisClient()
    if (!redis) return 0

    const keys = await redis.keys(pattern)

    if (keys.length === 0) {
      return 0
    }

    await redis.del(...keys)
    logDebug('Cache pattern deleted', { pattern, count: keys.length })
    return keys.length
  } catch (error) {
    logError('Cache pattern delete error', error, { pattern })
    return 0
  }
}

/**
 * Check if key exists in cache
 */
export const hasCache = async (key: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    const exists = await redis.exists(key)
    return exists === 1
  } catch (error) {
    logError('Cache exists error', error, { key })
    return false
  }
}

/**
 * Get remaining TTL for a key
 */
export const getCacheTTL = async (key: string): Promise<number> => {
  if (!isRedisAvailable()) {
    return -1
  }

  try {
    const redis = getRedisClient()
    if (!redis) return -1

    return await redis.ttl(key)
  } catch (error) {
    logError('Cache TTL error', error, { key })
    return -1
  }
}

/**
 * Increment a counter in cache
 */
export const incrementCache = async (key: string, ttl?: number): Promise<number> => {
  if (!isRedisAvailable()) {
    return 0
  }

  try {
    const redis = getRedisClient()
    if (!redis) return 0

    const value = await redis.incr(key)

    if (ttl && value === 1) {
      await redis.expire(key, ttl)
    }

    return value
  } catch (error) {
    logError('Cache increment error', error, { key })
    return 0
  }
}

/**
 * Add item to a set
 */
export const addToSet = async (key: string, value: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    await redis.sadd(key, value)
    return true
  } catch (error) {
    logError('Cache set add error', error, { key })
    return false
  }
}

/**
 * Remove item from a set
 */
export const removeFromSet = async (key: string, value: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    await redis.srem(key, value)
    return true
  } catch (error) {
    logError('Cache set remove error', error, { key })
    return false
  }
}

/**
 * Check if item exists in set
 */
export const isInSet = async (key: string, value: string): Promise<boolean> => {
  if (!isRedisAvailable()) {
    return false
  }

  try {
    const redis = getRedisClient()
    if (!redis) return false

    const exists = await redis.sismember(key, value)
    return exists === 1
  } catch (error) {
    logError('Cache set member error', error, { key })
    return false
  }
}

/**
 * Get all members of a set
 */
export const getSetMembers = async (key: string): Promise<string[]> => {
  if (!isRedisAvailable()) {
    return []
  }

  try {
    const redis = getRedisClient()
    if (!redis) return []

    return await redis.smembers(key)
  } catch (error) {
    logError('Cache set members error', error, { key })
    return []
  }
}
