import { Router } from 'express'
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markAsRead,
  getUnreadCount,
} from '../controllers/messageController'
import { authenticate } from '../middleware/auth'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Conversation routes
router.get('/conversations', getConversations)
router.get('/conversations/:userId', getOrCreateConversation)
router.get('/conversations/:conversationId/messages', getMessages)
router.post('/conversations/:conversationId/messages', sendMessage)
router.put('/conversations/:conversationId/read', markAsRead)
router.get('/unread-count', getUnreadCount)

export default router
