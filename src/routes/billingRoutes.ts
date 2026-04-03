import { Router, Request, Response } from 'express'
import {
  createCheckoutSession,
  createPremiumCheckout,
  getSubscriptionStatus,
  useBoost,
  getWhoVibedYou,
  getCustomerPortal,
  isStripeAvailable,
} from '../controllers/billingController'
import { authenticate } from '../middleware/auth'
import { requirePremium } from '../middleware/subscription'

const router = Router()

// Stripe webhook — MUST use raw body, no auth (Stripe sends it)
// This is registered separately in server.ts with express.raw()

/**
 * Billing is disabled until Stripe is configured.
 * All payment endpoints return 503; read-only / free endpoints still work.
 */
const billingDisabled = (_req: Request, res: Response): void => {
  res.status(503).json({ message: 'Billing is not available yet. Stay tuned!' })
}

// Authenticated routes — gated behind Stripe availability
router.post('/checkout',        authenticate, isStripeAvailable() ? createCheckoutSession : billingDisabled)
router.post('/create-checkout', authenticate, isStripeAvailable() ? createPremiumCheckout : billingDisabled)
router.get('/status',           authenticate, getSubscriptionStatus)  // read-only, always available
router.get('/portal',           authenticate, isStripeAvailable() ? getCustomerPortal : billingDisabled)
router.post('/boost',           authenticate, useBoost)               // logic-only, no Stripe call
router.get('/who-vibed',        authenticate, requirePremium, getWhoVibedYou)

export default router
