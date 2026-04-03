import { Router } from 'express'
import {
  createCheckoutSession,
  createPremiumCheckout,
  getSubscriptionStatus,
  useBoost,
  getWhoVibedYou,
  getCustomerPortal,
} from '../controllers/billingController'
import { authenticate } from '../middleware/auth'
import { requirePremium } from '../middleware/subscription'

const router = Router()

// Stripe webhook — MUST use raw body, no auth (Stripe sends it)
// This is registered separately in server.ts with express.raw()

// Authenticated routes
router.post('/checkout', authenticate, createCheckoutSession)
router.post('/create-checkout', authenticate, createPremiumCheckout)
router.get('/status', authenticate, getSubscriptionStatus)
router.get('/portal', authenticate, getCustomerPortal)
router.post('/boost', authenticate, useBoost)
router.get('/who-vibed', authenticate, requirePremium, getWhoVibedYou)

export default router
