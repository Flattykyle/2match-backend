import { Request, Response } from 'express'
import Stripe from 'stripe'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'
import { logInfo, logError } from '../utils/logger'
import { deleteCache } from '../services/cacheService'

// Only initialize Stripe when the secret key is configured
const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil' as any,
    })
  : null

if (!stripe) {
  console.log('Billing: disabled (coming soon)')
}

/** Check whether Stripe is configured and available */
export const isStripeAvailable = (): boolean => stripe !== null

// Stripe Price IDs (set in .env or hardcode for development)
const PRICE_IDS: Record<string, string> = {
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium_placeholder',
  PLATINUM: process.env.STRIPE_PLATINUM_PRICE_ID || 'price_platinum_placeholder',
  PREMIUM_MONTHLY: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium_monthly_placeholder',
  PREMIUM_ANNUAL: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || 'price_premium_annual_placeholder',
}

const TIER_FROM_PRICE: Record<string, string> = {}
// Build reverse lookup
Object.entries(PRICE_IDS).forEach(([tier, priceId]) => {
  TIER_FROM_PRICE[priceId] = tier
})

// ----------------------------------------
// CREATE CHECKOUT SESSION
// POST /api/billing/checkout
// Body: { tier: 'PREMIUM' | 'PLATINUM' }
// ----------------------------------------
export const createCheckoutSession = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Billing not configured' })
      return
    }

    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { tier } = req.body
    if (!tier || !PRICE_IDS[tier]) {
      res.status(400).json({ message: 'Invalid tier. Must be PREMIUM or PLATINUM.' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, stripeCustomerId: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: req.userId },
      })
      customerId = customer.id

      await prisma.user.update({
        where: { id: req.userId },
        data: { stripeCustomerId: customerId },
      })
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: PRICE_IDS[tier],
          quantity: 1,
        },
      ],
      success_url: `${clientUrl}/upgrade?success=true&tier=${tier}`,
      cancel_url: `${clientUrl}/upgrade?canceled=true`,
      metadata: {
        userId: req.userId,
        tier,
      },
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error('Create checkout session error:', error)
    res.status(500).json({ message: 'Error creating checkout session' })
  }
}

// ----------------------------------------
// STRIPE WEBHOOK
// POST /api/billing/webhook
// ----------------------------------------
export const handleWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!stripe) {
    res.status(503).json({ error: 'Billing not configured' })
    return
  }

  const sig = req.headers['stripe-signature'] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    res.status(400).json({ message: 'Webhook Error' })
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const tier = session.metadata?.tier

        if (userId && tier) {
          const subscriptionId = session.subscription as string

          // Get subscription to find the current period end
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
          const expiresAt = new Date((subscription.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000)

          const isPremiumTier = ['PREMIUM', 'PREMIUM_MONTHLY', 'PREMIUM_ANNUAL', 'PLATINUM'].includes(tier)

          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: tier.startsWith('PREMIUM') ? 'PREMIUM' : tier,
              subscriptionExpiresAt: expiresAt,
              stripeSubscriptionId: subscriptionId,
              isPremium: isPremiumTier,
              premiumExpiresAt: isPremiumTier ? expiresAt : null,
              // Platinum gets 1 weekly boost
              ...(tier === 'PLATINUM' ? { weeklyBoostsRemaining: 1 } : {}),
            },
          })

          // Invalidate tier cache
          await deleteCache(`sub:tier:${userId}`)

          logInfo(`Subscription activated: ${tier} for user ${userId}`, { subscriptionId })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by Stripe customer ID
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        })

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionTier: 'FREE',
              subscriptionExpiresAt: null,
              stripeSubscriptionId: null,
              isPremium: false,
              premiumExpiresAt: null,
              weeklyBoostsRemaining: 0,
            },
          })

          await deleteCache(`sub:tier:${user.id}`)

          logInfo(`Subscription canceled for user ${user.id}`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        // Renewal: update expiry date
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
        const customerId = subscription.customer as string
        const expiresAt = new Date((subscription.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000)

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        })

        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionExpiresAt: expiresAt },
          })
          await deleteCache(`sub:tier:${user.id}`)
        }
        break
      }
    }

    res.json({ received: true })
  } catch (error) {
    logError('Webhook processing error', error as Error)
    res.status(500).json({ message: 'Webhook processing error' })
  }
}

// ----------------------------------------
// GET SUBSCRIPTION STATUS
// GET /api/billing/status
// ----------------------------------------
export const getSubscriptionStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        weeklyBoostsRemaining: true,
        lastBoostResetAt: true,
        lastBoostedAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Calculate next boost reset (Monday 00:00 UTC)
    const now = new Date()
    const dayOfWeek = now.getUTCDay()
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
    const nextReset = new Date(now)
    nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday)
    nextReset.setUTCHours(0, 0, 0, 0)

    res.json({
      ...user,
      nextBoostReset: nextReset.toISOString(),
    })
  } catch (error) {
    console.error('Get subscription status error:', error)
    res.status(500).json({ message: 'Error fetching subscription status' })
  }
}

// ----------------------------------------
// USE PROFILE BOOST
// POST /api/billing/boost
// Platinum only, deducts from weeklyBoostsRemaining
// ----------------------------------------
export const useBoost = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        subscriptionTier: true,
        weeklyBoostsRemaining: true,
        lastBoostedAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    if (user.subscriptionTier !== 'PLATINUM') {
      res.status(403).json({ message: 'Profile Boost requires Platinum.', code: 'PLATINUM_REQUIRED' })
      return
    }

    if (user.weeklyBoostsRemaining <= 0) {
      res.status(429).json({ message: 'No boosts remaining this week. Resets every Monday.' })
      return
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        weeklyBoostsRemaining: { decrement: 1 },
        lastBoostedAt: new Date(),
      },
    })

    res.json({
      message: 'Profile boosted! You\'ll appear at the top of discovery for the next hour.',
      boostsRemaining: user.weeklyBoostsRemaining - 1,
    })
  } catch (error) {
    console.error('Use boost error:', error)
    res.status(500).json({ message: 'Error using boost' })
  }
}

// ----------------------------------------
// GET WHO VIBED YOU (likes received)
// GET /api/billing/who-vibed
// Premium+ only
// ----------------------------------------
export const getWhoVibedYou = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const likes = await prisma.like.findMany({
      where: { likedUserId: req.userId },
      include: {
        liker: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            profilePictures: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.json({
      users: likes.map((l) => ({
        ...l.liker,
        likedAt: l.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get who vibed you error:', error)
    res.status(500).json({ message: 'Error fetching who vibed you' })
  }
}

// ----------------------------------------
// CREATE PREMIUM CHECKOUT
// POST /api/billing/create-checkout
// Body: { plan: 'monthly' | 'annual' }
// ----------------------------------------
export const createPremiumCheckout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Billing not configured' })
      return
    }

    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { plan } = req.body
    const validPlans = ['monthly', 'annual']
    if (!plan || !validPlans.includes(plan)) {
      res.status(400).json({ message: 'plan must be "monthly" or "annual"' })
      return
    }

    const priceId = plan === 'monthly'
      ? PRICE_IDS.PREMIUM_MONTHLY
      : PRICE_IDS.PREMIUM_ANNUAL

    const tier = plan === 'monthly' ? 'PREMIUM_MONTHLY' : 'PREMIUM_ANNUAL'

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, stripeCustomerId: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: req.userId },
      })
      customerId = customer.id
      await prisma.user.update({
        where: { id: req.userId },
        data: { stripeCustomerId: customerId },
      })
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${clientUrl}/upgrade?success=true&tier=PREMIUM`,
      cancel_url: `${clientUrl}/upgrade?canceled=true`,
      metadata: { userId: req.userId, tier },
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error('Create premium checkout error:', error)
    res.status(500).json({ message: 'Error creating checkout session' })
  }
}

// ----------------------------------------
// GET CUSTOMER PORTAL
// GET /api/billing/portal
// ----------------------------------------
export const getCustomerPortal = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!stripe) {
      res.status(503).json({ error: 'Billing not configured' })
      return
    }

    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { stripeCustomerId: true },
    })

    if (!user?.stripeCustomerId) {
      res.status(400).json({ message: 'No Stripe customer found. Subscribe first.' })
      return
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${clientUrl}/settings`,
    })

    res.json({ url: session.url })
  } catch (error) {
    console.error('Get customer portal error:', error)
    res.status(500).json({ message: 'Error creating portal session' })
  }
}
