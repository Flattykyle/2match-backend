import { PrismaClient, VibeTagCategory } from '@prisma/client'

const prisma = new PrismaClient()

const tags: { label: string; emoji: string; category: VibeTagCategory }[] = [
  // ── PERSONALITY (5) ──
  { label: 'Overthinks in a cute way', emoji: '🧠', category: 'PERSONALITY' },
  { label: 'Main character energy', emoji: '🎬', category: 'PERSONALITY' },
  { label: 'Background character actually', emoji: '🫥', category: 'PERSONALITY' },
  { label: 'Cries at commercials', emoji: '🥹', category: 'PERSONALITY' },
  { label: 'Has a theory about everything', emoji: '🔍', category: 'PERSONALITY' },

  // ── LIFESTYLE (5) ──
  { label: 'Morning person apologist', emoji: '🌅', category: 'LIFESTYLE' },
  { label: 'Gym is my therapy', emoji: '🏋️', category: 'LIFESTYLE' },
  { label: 'Plants over people tbh', emoji: '🪴', category: 'LIFESTYLE' },
  { label: 'Homebody with wanderlust', emoji: '🗺️', category: 'LIFESTYLE' },
  { label: 'Perpetually running 5 mins late', emoji: '⏰', category: 'LIFESTYLE' },

  // ── DATING_STYLE (5) ──
  { label: "Let's get coffee first", emoji: '☕', category: 'DATING_STYLE' },
  { label: 'Slow texter, deep feeler', emoji: '💭', category: 'DATING_STYLE' },
  { label: 'Sends memes instead of feelings', emoji: '📱', category: 'DATING_STYLE' },
  { label: 'Words of affirmation person', emoji: '💌', category: 'DATING_STYLE' },
  { label: 'Love language is quality time', emoji: '🕰️', category: 'DATING_STYLE' },

  // ── HUMOUR (5) ──
  { label: 'Dry humour or nothing', emoji: '🍸', category: 'HUMOUR' },
  { label: 'Comedian in group chats', emoji: '💬', category: 'HUMOUR' },
  { label: 'Sarcastic but means well', emoji: '😏', category: 'HUMOUR' },
  { label: 'Dad joke enthusiast', emoji: '👴', category: 'HUMOUR' },
  { label: 'Too online', emoji: '📡', category: 'HUMOUR' },

  // ── VALUES (5) ──
  { label: 'Family first always', emoji: '👨‍👩‍👧‍👦', category: 'VALUES' },
  { label: 'Climate anxiety haver', emoji: '🌍', category: 'VALUES' },
  { label: "Will vote and won't shut up about it", emoji: '🗳️', category: 'VALUES' },
  { label: 'Financial literacy nerd', emoji: '📊', category: 'VALUES' },
  { label: 'Big on consent culture', emoji: '🤝', category: 'VALUES' },

  // ── INTERESTS (5 bonus to fill category) ──
  { label: 'Podcast binge listener', emoji: '🎧', category: 'INTERESTS' },
  { label: 'Museum date enjoyer', emoji: '🎨', category: 'INTERESTS' },
  { label: 'Hiking > clubbing', emoji: '🥾', category: 'INTERESTS' },
  { label: 'Bookworm energy', emoji: '📚', category: 'INTERESTS' },
  { label: 'Foodie without the blog', emoji: '🍜', category: 'INTERESTS' },
]

async function main() {
  console.log('Seeding 30 vibe tags across 6 categories...')

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
