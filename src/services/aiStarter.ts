import Anthropic from '@anthropic-ai/sdk'
import prisma from '../utils/prisma'
import { getCache, setCache, deleteCache } from './cacheService'

const CACHE_TTL = 3600 // 1 hour

function cacheKey(matchId: string, userId: string) {
  return `ai_starters:${matchId}:${userId}`
}

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a warm, witty matchmaker for a Gen Z dating app called 2-Match. Generate 3 conversation openers for two people who just matched. Each opener must:
1. Reference something specific from BOTH profiles — not generic.
2. Feel like something a thoughtful human would actually say, not an AI.
3. Be under 2 sentences.
4. Have a different tone — one warm, one playful, one curious.

Never mention the app or that you're AI.

Return ONLY a JSON array of 3 strings, no other text. Example:
["opener 1", "opener 2", "opener 3"]`

function buildProfileSummary(user: any, label: string): string {
  const parts: string[] = [`${label}: ${user.firstName}`]

  if (user.bio) parts.push(`Bio: "${user.bio}"`)
  if (user.intention) parts.push(`Looking for: ${user.intention}`)
  if (user.interests?.length) parts.push(`Interests: ${user.interests.join(', ')}`)
  if (user.hobbies?.length) parts.push(`Hobbies: ${user.hobbies.join(', ')}`)
  if (user.talents?.length) parts.push(`Talents: ${user.talents.join(', ')}`)
  if (user.currentlyObsessedWith) parts.push(`Currently obsessed with: ${user.currentlyObsessedWith}`)
  if (user.redFlag) parts.push(`Red flag: ${user.redFlag}`)
  if (user.greenFlag) parts.push(`Green flag: ${user.greenFlag}`)

  if (user.profilePrompts) {
    try {
      const prompts = typeof user.profilePrompts === 'string'
        ? JSON.parse(user.profilePrompts)
        : user.profilePrompts
      if (Array.isArray(prompts)) {
        const promptText = prompts
          .map((p: { question: string; answer: string }) => `"${p.question}" → "${p.answer}"`)
          .join('; ')
        if (promptText) parts.push(`Prompts: ${promptText}`)
      }
    } catch {
      // skip malformed prompts
    }
  }

  if (user.vibeTags?.length) {
    const tags = user.vibeTags.map((t: { emoji: string; label: string }) => `${t.emoji} ${t.label}`).join(', ')
    parts.push(`Vibe tags: ${tags}`)
  }

  return parts.join(' | ')
}

export async function generateConversationStarters(
  matchId: string,
  requestingUserId: string
): Promise<string[]> {
  // Check cache first
  const cached = await getCache<string[]>(cacheKey(matchId, requestingUserId))
  if (cached) return cached

  // Fetch match + both users
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      user1: {
        select: {
          id: true,
          firstName: true,
          bio: true,
          intention: true,
          interests: true,
          hobbies: true,
          talents: true,
          currentlyObsessedWith: true,
          redFlag: true,
          greenFlag: true,
          profilePrompts: true,
          userVibeTags: {
            include: { vibeTag: { select: { label: true, emoji: true } } },
          },
        },
      },
      user2: {
        select: {
          id: true,
          firstName: true,
          bio: true,
          intention: true,
          interests: true,
          hobbies: true,
          talents: true,
          currentlyObsessedWith: true,
          redFlag: true,
          greenFlag: true,
          profilePrompts: true,
          userVibeTags: {
            include: { vibeTag: { select: { label: true, emoji: true } } },
          },
        },
      },
    },
  })

  if (!match) throw new Error('Match not found')

  // Determine who is A (requester) and who is B
  const isUser1 = match.userId1 === requestingUserId
  const userA = isUser1 ? match.user1 : match.user2
  const userB = isUser1 ? match.user2 : match.user1

  // Flatten vibe tags
  const flatA = {
    ...userA,
    vibeTags: (userA as any).userVibeTags?.map((uvt: any) => uvt.vibeTag) ?? [],
  }
  const flatB = {
    ...userB,
    vibeTags: (userB as any).userVibeTags?.map((uvt: any) => uvt.vibeTag) ?? [],
  }

  const summaryA = buildProfileSummary(flatA, 'User A (sender)')
  const summaryB = buildProfileSummary(flatB, 'User B (receiver)')

  const userMessage = `${summaryA}\n\n${summaryB}\n\nWrite 3 openers from User A's perspective to send to User B.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    temperature: 0.8,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  // Extract text from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  // Parse JSON array from response
  const starters = parseStarters(text)

  // Cache the result
  await setCache(cacheKey(matchId, requestingUserId), starters, CACHE_TTL)

  return starters
}

export async function clearStarterCache(matchId: string, userId: string): Promise<void> {
  await deleteCache(cacheKey(matchId, userId))
}

function parseStarters(text: string): string[] {
  try {
    // Try direct JSON parse first
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3).map(String)
    }
  } catch {
    // Try to extract JSON array from surrounding text
    const match = text.match(/\[[\s\S]*?\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed.slice(0, 3).map(String)
        }
      } catch {
        // fall through
      }
    }
  }

  // Last resort: split by newlines and clean up
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter((l) => l.length > 0)

  if (lines.length >= 3) return lines.slice(0, 3)

  throw new Error('Failed to parse conversation starters from AI response')
}
