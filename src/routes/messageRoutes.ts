import { Router } from 'express'
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markAsRead,
  getUnreadCount,
} from '../controllers/messageController'
import {
  getChatRequests,
  acceptChatRequest,
  declineChatRequest,
} from '../controllers/messageRequestController'
import { authenticate } from '../middleware/auth'
import { checkActiveHours } from '../middleware/safety'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Chat request routes (must be before :conversationId param routes)
router.get('/requests', getChatRequests)
router.post('/requests/:conversationId/accept', acceptChatRequest)
router.post('/requests/:conversationId/decline', declineChatRequest)

// Conversation routes
router.get('/conversations', getConversations)
router.get('/conversations/:userId', getOrCreateConversation)
router.get('/conversations/:conversationId/messages', getMessages)
router.post('/conversations/:conversationId/messages', checkActiveHours, sendMessage)
router.put('/conversations/:conversationId/read', markAsRead)
router.get('/unread-count', getUnreadCount)

export default router
