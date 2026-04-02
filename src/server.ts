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
import icebreakerRoutes from './routes/icebreakerRoutes'
import vibeTagRoutes from './routes/vibeTagRoutes'
import safetyRoutes from './routes/safetyRoutes'
import billingRoutes from './routes/billingRoutes'
import { handleWebhook } from './controllers/billingController'
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
import { startMessageExpiryJob, stopMessageExpiryJob } from './jobs/messageExpiry'
import { startBoostResetJob, stopBoostResetJob } from './jobs/boostReset'

// Load environment variables
dotenv.config()

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

// Debug logging for deployment
console.log('='.repeat(60))
console.log('🚀 Starting 2-Match API Server')
console.log('='.repeat(60))
console.log(`📍 PORT: ${PORT}`)
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
console.log(`🔗 Binding to: 0.0.0.0:${PORT}`)
console.log('='.repeat(60))

// Initialize Sentry for error tracking (with error handling)
try {
  console.log('⚙️  Initializing Sentry...')
  initializeSentry(app)
  console.log('✅ Sentry initialized successfully')

  // Sentry request handler (must be first middleware)
  app.use(sentryRequestHandler())
  app.use(sentryTracingHandler())
} catch (error) {
  console.error('⚠️  Warning: Sentry initialization failed:', error)
  console.log('📝 Server will continue without Sentry error tracking')
}

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

// Stripe webhook needs raw body BEFORE json parsing
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleWebhook)

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
app.use('/api/icebreakers', icebreakerRoutes)
app.use('/api/vibe-tags', vibeTagRoutes)
app.use('/api/safety', safetyRoutes)
app.use('/api/billing', billingRoutes)

// Sentry error handler (must be before custom error handlers)
app.use(sentryErrorHandler())

// Custom error handler
app.use(errorHandler)

// CRITICAL: Start server and bind to port FIRST (before initializing optional services)
// This ensures Render can detect the open port quickly
console.log('='.repeat(60))
console.log('🔌 Starting HTTP server and binding to port...')
httpServer.listen(PORT as number, '0.0.0.0', async () => {
  console.log('='.repeat(60))
  console.log('✅ HTTP SERVER IS LISTENING')
  console.log(`🌐 Server is running on http://0.0.0.0:${PORT}`)
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log('='.repeat(60))

  logInfo('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    host: '0.0.0.0',
  })

  // Now initialize optional services asynchronously (non-blocking)
  console.log('⚙️  Initializing optional services...')

  // Initialize Socket.io (with error handling)
  try {
    console.log('⚙️  Setting up Socket.io...')
    setupSocket(httpServer)
    console.log('✅ Socket.io initialized successfully')
    logInfo('Socket.io setup complete')
  } catch (error) {
    console.error('⚠️  Warning: Socket.io setup failed:', error)
    console.log('📝 Server will continue without real-time messaging')
    logError('Socket.io setup failed', error as Error)
  }

  // Initialize Redis (with error handling, non-blocking)
  try {
    console.log('⚙️  Connecting to Redis...')
    await initializeRedis()
    console.log('✅ Redis connected successfully')
    logInfo('Redis connection established')
  } catch (error) {
    console.error('⚠️  Warning: Redis connection failed:', error)
    console.log('📝 Server will continue without Redis caching')
    logError('Redis initialization failed', error as Error)
  }

  // Start background jobs
  startMessageExpiryJob()
  startBoostResetJob()

  console.log('='.repeat(60))
  console.log('🎉 2-Match API is fully operational!')
  console.log('='.repeat(60))
})

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  console.error('='.repeat(60))
  console.error('❌ HTTP SERVER ERROR')
  console.error('='.repeat(60))

  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`)
    console.error(`💡 Try running: npx kill-port ${PORT}`)
    logError(`Port ${PORT} is already in use`, error)
  } else if (error.code === 'EACCES') {
    console.error(`❌ Permission denied to bind to port ${PORT}`)
    console.error(`💡 Try using a port above 1024 or run with elevated privileges`)
    logError(`Permission denied for port ${PORT}`, error)
  } else {
    console.error(`❌ Server error (${error.code}):`, error.message)
    console.error('Full error:', error)
    logError('Server error', error)
  }

  console.error('='.repeat(60))
  process.exit(1)
})

// Log when server is closing
httpServer.on('close', () => {
  console.log('🔌 HTTP server closed')
  logInfo('HTTP server closed')
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log('\n' + '='.repeat(60))
  console.log(`👋 ${signal} received, shutting down gracefully...`)
  console.log('='.repeat(60))
  logInfo(`${signal} received, shutting down gracefully...`)

  // Stop background jobs
  stopMessageExpiryJob()
  stopBoostResetJob()

  // Close Redis connection (with timeout)
  try {
    console.log('🔌 Closing Redis connection...')
    await Promise.race([
      closeRedis(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Redis close timeout')), 5000)
      ),
    ])
    console.log('✅ Redis connection closed')
  } catch (error) {
    console.error('⚠️  Warning: Redis close failed or timed out:', error)
    logError('Redis close failed', error as Error)
  }

  // Close HTTP server (with timeout)
  console.log('🔌 Closing HTTP server...')
  const closeTimeout = setTimeout(() => {
    console.error('❌ Server close timeout, forcing shutdown')
    process.exit(1)
  }, 10000)

  httpServer.close(() => {
    clearTimeout(closeTimeout)
    console.log('✅ Server closed successfully')
    console.log('='.repeat(60))
    logInfo('Server closed successfully')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('='.repeat(60))
  console.error('❌ UNCAUGHT EXCEPTION')
  console.error('='.repeat(60))
  console.error('Error:', error.message)
  console.error('Stack:', error.stack)
  console.error('='.repeat(60))
  logError('Uncaught Exception', error)
  process.exit(1)
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('='.repeat(60))
  console.error('❌ UNHANDLED PROMISE REJECTION')
  console.error('='.repeat(60))
  console.error('Reason:', reason)
  console.error('Promise:', promise)
  console.error('='.repeat(60))
  logError('Unhandled Promise Rejection', reason)
  process.exit(1)
})

export default app
