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
import { sendVoiceMessage } from '../controllers/voiceMemoController'
import { authenticate } from '../middleware/auth'
import { checkActiveHours } from '../middleware/safety'
import { uploadAudioSingle } from '../middleware/upload'

const router = Router()

router.use(authenticate)

// Chat request routes
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

// Voice message route
router.post('/:matchId/voice', uploadAudioSingle, sendVoiceMessage)

export default router
