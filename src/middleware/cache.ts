import { Request, Response, NextFunction } from 'express'
import { getCache, setCache } from '../services/cacheService'
import { logDebug } from '../utils/logger'

/**
 * Cache middleware for GET requests
 * Caches response based on request URL and user ID
 */
export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next()
    }

    // Generate cache key from URL and user ID
    const userId = (req as any).userId || 'anonymous'
    const cacheKey = `api:cache:${userId}:${req.originalUrl}`

    try {
      // Try to get cached response
      const cachedResponse = await getCache<any>(cacheKey)

      if (cachedResponse) {
        logDebug('Serving from cache', { cacheKey })
        return res.json(cachedResponse)
      }

      // Store original res.json function
      const originalJson = res.json.bind(res)

      // Override res.json to cache the response
      res.json = function (body: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCache(cacheKey, body, ttl).catch((err) => {
            logDebug('Failed to cache response', { error: err.message })
          })
        }

        return originalJson(body)
      }

      next()
    } catch (error) {
      // If cache fails, continue without caching
      logDebug('Cache middleware error', { error })
      next()
    }
  }
}

/**
 * Cache middleware for specific endpoints
 */
export const cacheProfiles = cacheMiddleware(600) // 10 minutes
export const cacheMatches = cacheMiddleware(300) // 5 minutes
export const cacheDiscovery = cacheMiddleware(180) // 3 minutes
export const cacheStats = cacheMiddleware(600) // 10 minutes
