-- ============================================
-- Users: voice intro fields
-- ============================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voiceIntroUrl" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voiceIntroDuration" INTEGER;

-- ============================================
-- Users: subscription & billing fields
-- ============================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weeklyBoostsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastBoostResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastBoostedAt" TIMESTAMP(3);

-- ============================================
-- Users: safety / comfort zone fields
-- ============================================
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slowModeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slowModeLimit" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activeHoursStart" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activeHoursEnd" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photoShieldEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emergencyContactName" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emergencyContactPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- ============================================
-- Matches: icebreaker unlock flag
-- ============================================
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "icebreakerUnlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "matches_userId1_status_idx" ON "matches"("userId1", "status");
CREATE INDEX IF NOT EXISTS "matches_userId2_status_idx" ON "matches"("userId2", "status");
CREATE INDEX IF NOT EXISTS "matches_userId1_matchedAt_idx" ON "matches"("userId1", "matchedAt");
CREATE INDEX IF NOT EXISTS "matches_userId2_matchedAt_idx" ON "matches"("userId2", "matchedAt");

-- ============================================
-- Conversations: request status for chat requests
-- ============================================
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "requestStatus" TEXT NOT NULL DEFAULT 'accepted';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_requestStatus_idx" ON "conversations"("requestStatus");

-- ============================================
-- Messages: read receipt, expiry, soft delete
-- ============================================
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_expiresAt_idx" ON "messages"("expiresAt");
CREATE INDEX IF NOT EXISTS "messages_isDeleted_idx" ON "messages"("isDeleted");
CREATE INDEX IF NOT EXISTS "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");
CREATE INDEX IF NOT EXISTS "messages_conversationId_isDeleted_sentAt_idx" ON "messages"("conversationId", "isDeleted", "sentAt");
CREATE INDEX IF NOT EXISTS "messages_receiverId_isRead_idx" ON "messages"("receiverId", "isRead");
CREATE INDEX IF NOT EXISTS "messages_conversationId_receiverId_isRead_idx" ON "messages"("conversationId", "receiverId", "isRead");
CREATE INDEX IF NOT EXISTS "messages_expiresAt_isDeleted_idx" ON "messages"("expiresAt", "isDeleted");

-- ============================================
-- New table: message_reactions
-- ============================================
CREATE TABLE IF NOT EXISTS "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_messageId_userId_key" ON "message_reactions"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "message_reactions_messageId_idx" ON "message_reactions"("messageId");

ALTER TABLE "message_reactions" DROP CONSTRAINT IF EXISTS "message_reactions_messageId_fkey";
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: icebreaker_questions
-- ============================================
CREATE TABLE IF NOT EXISTS "icebreaker_questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "icebreaker_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "icebreaker_questions_isActive_idx" ON "icebreaker_questions"("isActive");
CREATE INDEX IF NOT EXISTS "icebreaker_questions_category_idx" ON "icebreaker_questions"("category");

-- ============================================
-- New table: icebreaker_answers
-- ============================================
CREATE TABLE IF NOT EXISTS "icebreaker_answers" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icebreaker_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "icebreaker_answers_matchId_userId_questionId_key" ON "icebreaker_answers"("matchId", "userId", "questionId");
CREATE INDEX IF NOT EXISTS "icebreaker_answers_matchId_idx" ON "icebreaker_answers"("matchId");
CREATE INDEX IF NOT EXISTS "icebreaker_answers_userId_idx" ON "icebreaker_answers"("userId");
CREATE INDEX IF NOT EXISTS "icebreaker_answers_questionId_idx" ON "icebreaker_answers"("questionId");

ALTER TABLE "icebreaker_answers" DROP CONSTRAINT IF EXISTS "icebreaker_answers_matchId_fkey";
ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icebreaker_answers" DROP CONSTRAINT IF EXISTS "icebreaker_answers_userId_fkey";
ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icebreaker_answers" DROP CONSTRAINT IF EXISTS "icebreaker_answers_questionId_fkey";
ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "icebreaker_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: vibe_tags + junction table
-- ============================================
DO $$ BEGIN
  CREATE TYPE "VibeTagCategory" AS ENUM ('LIFESTYLE', 'PERSONALITY', 'INTERESTS', 'VALUES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vibe_tags" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "category" "VibeTagCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vibe_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vibe_tags_label_key" ON "vibe_tags"("label");
CREATE INDEX IF NOT EXISTS "vibe_tags_category_idx" ON "vibe_tags"("category");
CREATE INDEX IF NOT EXISTS "vibe_tags_isActive_idx" ON "vibe_tags"("isActive");

-- Prisma implicit M2M junction table for User <-> VibeTag
CREATE TABLE IF NOT EXISTS "_UserToVibeTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserToVibeTag_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX IF NOT EXISTS "_UserToVibeTag_B_index" ON "_UserToVibeTag"("B");

ALTER TABLE "_UserToVibeTag" DROP CONSTRAINT IF EXISTS "_UserToVibeTag_A_fkey";
ALTER TABLE "_UserToVibeTag" ADD CONSTRAINT "_UserToVibeTag_A_fkey" FOREIGN KEY ("A") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_UserToVibeTag" DROP CONSTRAINT IF EXISTS "_UserToVibeTag_B_fkey";
ALTER TABLE "_UserToVibeTag" ADD CONSTRAINT "_UserToVibeTag_B_fkey" FOREIGN KEY ("B") REFERENCES "vibe_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: sos_events
-- ============================================
CREATE TABLE IF NOT EXISTS "sos_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notifiedContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sos_events_userId_idx" ON "sos_events"("userId");
CREATE INDEX IF NOT EXISTS "sos_events_createdAt_idx" ON "sos_events"("createdAt");
