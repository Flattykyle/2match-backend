-- ============================================
-- Users: voice intro fields
-- ============================================
ALTER TABLE "users" ADD COLUMN "voiceIntroUrl" TEXT;
ALTER TABLE "users" ADD COLUMN "voiceIntroDuration" INTEGER;

-- ============================================
-- Users: subscription & billing fields
-- ============================================
ALTER TABLE "users" ADD COLUMN "subscriptionTier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "users" ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "users" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "users" ADD COLUMN "weeklyBoostsRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lastBoostResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ADD COLUMN "lastBoostedAt" TIMESTAMP(3);

-- ============================================
-- Users: safety / comfort zone fields
-- ============================================
ALTER TABLE "users" ADD COLUMN "slowModeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "slowModeLimit" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "users" ADD COLUMN "activeHoursStart" INTEGER;
ALTER TABLE "users" ADD COLUMN "activeHoursEnd" INTEGER;
ALTER TABLE "users" ADD COLUMN "photoShieldEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "emergencyContactName" TEXT;
ALTER TABLE "users" ADD COLUMN "emergencyContactPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- ============================================
-- Matches: icebreaker unlock flag
-- ============================================
ALTER TABLE "matches" ADD COLUMN "icebreakerUnlocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "matches_userId1_status_idx" ON "matches"("userId1", "status");
CREATE INDEX "matches_userId2_status_idx" ON "matches"("userId2", "status");
CREATE INDEX "matches_userId1_matchedAt_idx" ON "matches"("userId1", "matchedAt");
CREATE INDEX "matches_userId2_matchedAt_idx" ON "matches"("userId2", "matchedAt");

-- ============================================
-- Conversations: request status for chat requests
-- ============================================
ALTER TABLE "conversations" ADD COLUMN "requestStatus" TEXT NOT NULL DEFAULT 'accepted';

-- CreateIndex
CREATE INDEX "conversations_requestStatus_idx" ON "conversations"("requestStatus");

-- ============================================
-- Messages: read receipt, expiry, soft delete
-- ============================================
ALTER TABLE "messages" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "messages" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "messages_expiresAt_idx" ON "messages"("expiresAt");
CREATE INDEX "messages_isDeleted_idx" ON "messages"("isDeleted");
CREATE INDEX "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");
CREATE INDEX "messages_conversationId_isDeleted_sentAt_idx" ON "messages"("conversationId", "isDeleted", "sentAt");
CREATE INDEX "messages_receiverId_isRead_idx" ON "messages"("receiverId", "isRead");
CREATE INDEX "messages_conversationId_receiverId_isRead_idx" ON "messages"("conversationId", "receiverId", "isRead");
CREATE INDEX "messages_expiresAt_isDeleted_idx" ON "messages"("expiresAt", "isDeleted");

-- ============================================
-- New table: message_reactions
-- ============================================
CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_reactions_messageId_userId_key" ON "message_reactions"("messageId", "userId");
CREATE INDEX "message_reactions_messageId_idx" ON "message_reactions"("messageId");

ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: icebreaker_questions
-- ============================================
CREATE TABLE "icebreaker_questions" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "icebreaker_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "icebreaker_questions_isActive_idx" ON "icebreaker_questions"("isActive");
CREATE INDEX "icebreaker_questions_category_idx" ON "icebreaker_questions"("category");

-- ============================================
-- New table: icebreaker_answers
-- ============================================
CREATE TABLE "icebreaker_answers" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "icebreaker_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "icebreaker_answers_matchId_userId_questionId_key" ON "icebreaker_answers"("matchId", "userId", "questionId");
CREATE INDEX "icebreaker_answers_matchId_idx" ON "icebreaker_answers"("matchId");
CREATE INDEX "icebreaker_answers_userId_idx" ON "icebreaker_answers"("userId");
CREATE INDEX "icebreaker_answers_questionId_idx" ON "icebreaker_answers"("questionId");

ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icebreaker_answers" ADD CONSTRAINT "icebreaker_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "icebreaker_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: vibe_tags + junction table
-- ============================================
CREATE TYPE "VibeTagCategory" AS ENUM ('LIFESTYLE', 'PERSONALITY', 'INTERESTS', 'VALUES');

CREATE TABLE "vibe_tags" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "category" "VibeTagCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vibe_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vibe_tags_label_key" ON "vibe_tags"("label");
CREATE INDEX "vibe_tags_category_idx" ON "vibe_tags"("category");
CREATE INDEX "vibe_tags_isActive_idx" ON "vibe_tags"("isActive");

-- Prisma implicit M2M junction table for User <-> VibeTag
CREATE TABLE "_UserToVibeTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserToVibeTag_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_UserToVibeTag_B_index" ON "_UserToVibeTag"("B");

ALTER TABLE "_UserToVibeTag" ADD CONSTRAINT "_UserToVibeTag_A_fkey" FOREIGN KEY ("A") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_UserToVibeTag" ADD CONSTRAINT "_UserToVibeTag_B_fkey" FOREIGN KEY ("B") REFERENCES "vibe_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- New table: sos_events
-- ============================================
CREATE TABLE "sos_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notifiedContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sos_events_userId_idx" ON "sos_events"("userId");
CREATE INDEX "sos_events_createdAt_idx" ON "sos_events"("createdAt");
