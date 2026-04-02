import { Router } from 'express'
import {
  createCheckoutSession,
  getSubscriptionStatus,
  useBoost,
  getWhoVibedYou,
} from '../controllers/billingController'
import { authenticate } from '../middleware/auth'
import { requirePremium } from '../middleware/subscription'

const router = Router()

// Stripe webhook — MUST use raw body, no auth (Stripe sends it)
// This is registered separately in server.ts with express.raw()

// Authenticated routes
router.post('/checkout', authenticate, createCheckoutSession)
router.get('/status', authenticate, getSubscriptionStatus)
router.post('/boost', authenticate, useBoost)
router.get('/who-vibed', authenticate, requirePremium, getWhoVibedYou)

export default router
