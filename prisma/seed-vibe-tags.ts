import { PrismaClient, VibeTagCategory } from '@prisma/client'

const prisma = new PrismaClient()

const tags: { label: string; emoji: string; category: VibeTagCategory }[] = [
  // ── LIFESTYLE (8) ──
  { label: 'Foodie', emoji: '🍕', category: 'LIFESTYLE' },
  { label: 'Night owl', emoji: '🦉', category: 'LIFESTYLE' },
  { label: 'Early bird', emoji: '🌅', category: 'LIFESTYLE' },
  { label: 'Homebody', emoji: '🏠', category: 'LIFESTYLE' },
  { label: 'Traveller', emoji: '✈️', category: 'LIFESTYLE' },
  { label: 'Gym rat', emoji: '💪', category: 'LIFESTYLE' },
  { label: 'Vegan', emoji: '🌱', category: 'LIFESTYLE' },
  { label: 'Coffee lover', emoji: '☕', category: 'LIFESTYLE' },

  // ── PERSONALITY (8) ──
  { label: 'Introvert', emoji: '🤫', category: 'PERSONALITY' },
  { label: 'Extrovert', emoji: '🎉', category: 'PERSONALITY' },
  { label: 'Empath', emoji: '💗', category: 'PERSONALITY' },
  { label: 'Overthinker', emoji: '🧠', category: 'PERSONALITY' },
  { label: 'Spontaneous', emoji: '⚡', category: 'PERSONALITY' },
  { label: 'Planner', emoji: '📋', category: 'PERSONALITY' },
  { label: 'Funny', emoji: '😂', category: 'PERSONALITY' },
  { label: 'Deep thinker', emoji: '🤔', category: 'PERSONALITY' },

  // ── INTERESTS (12) ──
  { label: 'Bookworm', emoji: '📚', category: 'INTERESTS' },
  { label: 'Gamer', emoji: '🎮', category: 'INTERESTS' },
  { label: 'Musician', emoji: '🎵', category: 'INTERESTS' },
  { label: 'Artist', emoji: '🎨', category: 'INTERESTS' },
  { label: 'Coder', emoji: '💻', category: 'INTERESTS' },
  { label: 'Entrepreneur', emoji: '🚀', category: 'INTERESTS' },
  { label: 'Chef', emoji: '👨‍🍳', category: 'INTERESTS' },
  { label: 'Hiker', emoji: '🥾', category: 'INTERESTS' },
  { label: 'Dog lover', emoji: '🐕', category: 'INTERESTS' },
  { label: 'Cat lover', emoji: '🐱', category: 'INTERESTS' },
  { label: 'Dancer', emoji: '💃', category: 'INTERESTS' },
  { label: 'Photographer', emoji: '📸', category: 'INTERESTS' },

  // ── VALUES (6) ──
  { label: 'Family first', emoji: '👨‍👩‍👧‍👦', category: 'VALUES' },
  { label: 'Ambitious', emoji: '🎯', category: 'VALUES' },
  { label: 'Spiritual', emoji: '🧘', category: 'VALUES' },
  { label: 'Adventure seeker', emoji: '🏔️', category: 'VALUES' },
  { label: 'Growth mindset', emoji: '🌱', category: 'VALUES' },
  { label: 'Honest above all', emoji: '💎', category: 'VALUES' },
]

// Note: "Foodie" in INTERESTS replaced with "Chef" to avoid duplicate label constraint

async function main() {
  console.log('Seeding 34 vibe tags...')

  for (const tag of tags) {
    await prisma.vibeTag.upsert({
      where: { label: tag.label },
      update: { emoji: tag.emoji, category: tag.category },
      create: tag,
    })
  }

  const count = await prisma.vibeTag.count()
  console.log(`Done! ${count} vibe tags in database.`)
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
