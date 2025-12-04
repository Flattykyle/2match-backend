import express, { Request, Response } from 'express'
import http from 'http'
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import authRoutes from './routes/authRoutes'
import userRoutes from './routes/userRoutes'
import matchRoutes from './routes/matchRoutes'
import profileRoutes from './routes/profileRoutes'
import discoveryRoutes from './routes/discoveryRoutes'
import messageRoutes from './routes/messageRoutes'
import verificationRoutes from './routes/verificationRoutes'
import reportRoutes from './routes/reportRoutes'
import profileViewRoutes from './routes/profileViewRoutes'
import { errorHandler } from './middleware/errorHandler'
import { setupSocket } from './socket/socket'
import {
  helmetConfig,
  mongoSanitizeMiddleware,
  hppProtection,
  xssProtection,
  securityHeaders,
  corsConfig,
} from './middleware/security'
import {
  generalLimiter,
  authLimiter,
  verificationLimiter,
  reportLimiter,
  matchLimiter,
  messageLimiter,
  profileViewLimiter,
} from './middleware/rateLimiter'
import { conditionalRequestLogger } from './middleware/requestLogger'
import { logInfo, logError } from './utils/logger'
import {
  initializeSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
} from './config/sentry'
import { initializeRedis, closeRedis } from './config/redis'

// Load environment variables
dotenv.config()

// Initialize Redis
initializeRedis()

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

// Initialize Sentry for error tracking (must be first)
initializeSentry(app)

// Sentry request handler (must be first middleware)
app.use(sentryRequestHandler())
app.use(sentryTracingHandler())

// Setup Socket.io
setupSocket(httpServer)

// Compression middleware (compress responses)
app.use(compression({
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) {
      return false
    }
    return compression.filter(req, res)
  },
  threshold: 1024, // Only compress responses larger than 1KB
  level: 6, // Compression level (0-9, 6 is default)
}))

// Security Middleware (applied after Sentry)
app.use(helmetConfig)
app.use(securityHeaders)
app.use(cors(corsConfig))
app.use(mongoSanitizeMiddleware)
app.use(hppProtection)
app.use(xssProtection)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Winston request logging (replaces morgan)
app.use(conditionalRequestLogger)

// General rate limiting (applies to all routes)
app.use('/api/', generalLimiter)

// Root route
app.get('/', (_req, res) => {
  res.json({
    message: 'Welcome to 2-Match API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      profile: '/api/profile',
      discovery: '/api/discovery',
      messages: '/api/messages',
      matches: '/api/matches',
      verification: '/api/verification',
      reports: '/api/reports',
      profileViews: '/api/profile-views'
    }
  })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '2-Match API is running' })
})

// Routes with specific rate limiters
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/discovery', matchLimiter, discoveryRoutes)
app.use('/api/matches', matchRoutes)
app.use('/api/messages', messageLimiter, messageRoutes)
app.use('/api/verification', verificationLimiter, verificationRoutes)
app.use('/api/reports', reportLimiter, reportRoutes)
app.use('/api/profile-views', profileViewLimiter, profileViewRoutes)

// Sentry error handler (must be before custom error handlers)
app.use(sentryErrorHandler())

// Custom error handler
app.use(errorHandler)

// Start server
httpServer.listen(PORT, () => {
  logInfo('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    websocket: 'ready',
  })

  // Also log to console for visibility
  console.log(`🚀 Server is running on http://localhost:${PORT}`)
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`💬 WebSocket server is ready`)
})

// Handle port in use error
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logError(`Port ${PORT} is already in use`, error)
    console.error(`❌ Port ${PORT} is already in use`)
    console.log(`💡 Try running: npx kill-port ${PORT}`)
    process.exit(1)
  } else {
    logError('Server error', error)
    console.error('❌ Server error:', error)
    process.exit(1)
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logInfo('SIGTERM received, shutting down gracefully...')
  console.log('👋 SIGTERM received, shutting down gracefully...')

  // Close Redis connection
  await closeRedis()

  httpServer.close(() => {
    logInfo('Server closed successfully')
    console.log('✅ Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  logInfo('SIGINT received, shutting down gracefully...')
  console.log('\n👋 SIGINT received, shutting down gracefully...')

  // Close Redis connection
  await closeRedis()

  httpServer.close(() => {
    logInfo('Server closed successfully')
    console.log('✅ Server closed')
    process.exit(0)
  })
})

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logError('Uncaught Exception', error)
  console.error('❌ Uncaught Exception:', error)
  process.exit(1)
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logError('Unhandled Promise Rejection', reason)
  console.error('❌ Unhandled Rejection:', reason)
  process.exit(1)
})

export default app
