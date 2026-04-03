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
import iceBreakerGameRoutes from './routes/iceBreakerGameRoutes'
import vibeTagRoutes from './routes/vibeTagRoutes'
import safetyRoutes from './routes/safetyRoutes'
import billingRoutes from './routes/billingRoutes'
import voiceMemoRoutes from './routes/voiceMemoRoutes'
import spotifyRoutes from './routes/spotifyRoutes'
import playlistRoutes from './routes/playlistRoutes'
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
import { startDateCheckinJob, stopDateCheckinJob } from './jobs/dateCheckinReminder'

dotenv.config()

const app = express()
app.set('trust proxy', 1)  // Render/Vercel sit behind a reverse proxy — required for express-rate-limit & secure cookies
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

console.log('='.repeat(60))
console.log('Starting 2-Match API Server')
console.log('='.repeat(60))
console.log(`PORT: ${PORT}`)
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
console.log('='.repeat(60))

// Initialize Sentry
try {
  initializeSentry(app)
  app.use(sentryRequestHandler())
  app.use(sentryTracingHandler())
} catch (error) {
  console.error('Warning: Sentry initialization failed:', error)
}

// Compression
app.use(compression({
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) return false
    return compression.filter(req, res)
  },
  threshold: 1024,
  level: 6,
}))

// Security Middleware
app.use(helmetConfig)
app.use(securityHeaders)
app.use(cors(corsConfig))
app.options('*', cors(corsConfig))   // handle preflight requests explicitly
app.use(mongoSanitizeMiddleware)
app.use(hppProtection)
app.use(xssProtection)

// Stripe webhook needs raw body BEFORE json parsing
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleWebhook)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Request logging
app.use(conditionalRequestLogger)

// General rate limiting
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
      profileViews: '/api/profile-views',
      billing: '/api/billing',
    }
  })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: '2-Match API is running' })
})

// Routes
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
app.use('/api/icebreaker', iceBreakerGameRoutes)
app.use('/api/vibe-tags', vibeTagRoutes)
app.use('/api/safety', safetyRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/voice-memo', voiceMemoRoutes)
app.use('/api/spotify', spotifyRoutes)
app.use('/api/playlist', playlistRoutes)

// Error handlers
app.use(sentryErrorHandler())
app.use(errorHandler)

// Start server
httpServer.listen(PORT as number, '0.0.0.0', async () => {
  console.log('='.repeat(60))
  console.log(`Server running on http://0.0.0.0:${PORT}`)
  console.log('='.repeat(60))

  logInfo('Server started successfully', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  })

  // Initialize Socket.io
  try {
    setupSocket(httpServer)
    logInfo('Socket.io setup complete')
  } catch (error) {
    logError('Socket.io setup failed', error as Error)
  }

  // Initialize Redis
  try {
    await initializeRedis()
    logInfo('Redis connection established')
  } catch (error) {
    logError('Redis initialization failed', error as Error)
  }

  // Start background jobs
  startMessageExpiryJob()
  startBoostResetJob()
  startDateCheckinJob()

  console.log('2-Match API is fully operational!')
})

// Handle server errors
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`)
    logError(`Port ${PORT} is already in use`, error)
  } else {
    console.error(`Server error: ${error.message}`)
    logError('Server error', error)
  }
  process.exit(1)
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down...`)
  logInfo(`${signal} received, shutting down gracefully...`)

  // Stop background jobs
  stopMessageExpiryJob()
  stopBoostResetJob()
  stopDateCheckinJob()

  // Close Redis
  try {
    await Promise.race([
      closeRedis(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis close timeout')), 5000)),
    ])
  } catch (error) {
    logError('Redis close failed', error as Error)
  }

  // Close HTTP server
  const closeTimeout = setTimeout(() => {
    console.error('Server close timeout, forcing shutdown')
    process.exit(1)
  }, 10000)

  httpServer.close(() => {
    clearTimeout(closeTimeout)
    logInfo('Server closed successfully')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (error: Error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message)
  logError('Uncaught Exception', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED REJECTION:', reason)
  logError('Unhandled Promise Rejection', reason)
  process.exit(1)
})

export default app
