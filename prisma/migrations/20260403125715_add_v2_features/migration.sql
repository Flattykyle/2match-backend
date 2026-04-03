/*
  Warnings:

  - You are about to drop the `_UserToVibeTag` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[voiceMemoId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Intention" AS ENUM ('SERIOUS', 'CASUAL', 'FRIENDS_FIRST', 'OPEN', 'EXPLORING');

-- CreateEnum
CREATE TYPE "IceBreakerGameType" AS ENUM ('TWO_TRUTHS', 'HOT_TAKES', 'WOULD_YOU_RATHER');

-- CreateEnum
CREATE TYPE "IceBreakerGameStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DateCheckinStatus" AS ENUM ('PENDING', 'SAFE', 'MISSED');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('GREAT', 'GOOD', 'OKAY', 'BURNED_OUT', 'TAKING_BREAK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VibeTagCategory" ADD VALUE 'DATING_STYLE';
ALTER TYPE "VibeTagCategory" ADD VALUE 'HUMOUR';

-- DropForeignKey
ALTER TABLE "_UserToVibeTag" DROP CONSTRAINT "_UserToVibeTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_UserToVibeTag" DROP CONSTRAINT "_UserToVibeTag_B_fkey";

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "chatUnlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exchangeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playlistCreated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slowBurnEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currentlyObsessedWith" TEXT,
ADD COLUMN     "greenFlag" TEXT,
ADD COLUMN     "intention" "Intention" NOT NULL DEFAULT 'EXPLORING',
ADD COLUMN     "photoBlurEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "redFlag" TEXT,
ADD COLUMN     "spotifyAccessToken" TEXT,
ADD COLUMN     "spotifyConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "spotifyRefreshToken" TEXT,
ADD COLUMN     "voiceMemoId" TEXT;

-- AlterTable
ALTER TABLE "vibe_tags" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "_UserToVibeTag";

-- CreateTable
CREATE TABLE "user_vibe_tags" (
    "userId" TEXT NOT NULL,
    "vibeTagId" TEXT NOT NULL,

    CONSTRAINT "user_vibe_tags_pkey" PRIMARY KEY ("userId","vibeTagId")
);

-- CreateTable
CREATE TABLE "prompt_exchanges" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ice_breaker_games" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameType" "IceBreakerGameType" NOT NULL,
    "status" "IceBreakerGameStatus" NOT NULL DEFAULT 'PENDING',
    "payloadA" JSONB NOT NULL,
    "payloadB" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ice_breaker_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_playlists" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "spotifyPlaylistId" TEXT,
    "appleMusicId" TEXT,
    "tracks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_checkins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "status" "DateCheckinStatus" NOT NULL DEFAULT 'PENDING',
    "trustedContactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "date_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_checkins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" "Mood" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_memos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_vibe_tags_userId_idx" ON "user_vibe_tags"("userId");

-- CreateIndex
CREATE INDEX "user_vibe_tags_vibeTagId_idx" ON "user_vibe_tags"("vibeTagId");

-- CreateIndex
CREATE INDEX "prompt_exchanges_matchId_idx" ON "prompt_exchanges"("matchId");

-- CreateIndex
CREATE INDEX "prompt_exchanges_senderId_idx" ON "prompt_exchanges"("senderId");

-- CreateIndex
CREATE INDEX "prompt_exchanges_createdAt_idx" ON "prompt_exchanges"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ice_breaker_games_matchId_key" ON "ice_breaker_games"("matchId");

-- CreateIndex
CREATE INDEX "ice_breaker_games_status_idx" ON "ice_breaker_games"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shared_playlists_matchId_key" ON "shared_playlists"("matchId");

-- CreateIndex
CREATE INDEX "date_checkins_userId_idx" ON "date_checkins"("userId");

-- CreateIndex
CREATE INDEX "date_checkins_matchId_idx" ON "date_checkins"("matchId");

-- CreateIndex
CREATE INDEX "date_checkins_status_idx" ON "date_checkins"("status");

-- CreateIndex
CREATE INDEX "date_checkins_scheduledAt_idx" ON "date_checkins"("scheduledAt");

-- CreateIndex
CREATE INDEX "mood_checkins_userId_idx" ON "mood_checkins"("userId");

-- CreateIndex
CREATE INDEX "mood_checkins_mood_idx" ON "mood_checkins"("mood");

-- CreateIndex
CREATE INDEX "mood_checkins_createdAt_idx" ON "mood_checkins"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "voice_memos_userId_key" ON "voice_memos"("userId");

-- CreateIndex
CREATE INDEX "voice_memos_userId_idx" ON "voice_memos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "users_voiceMemoId_key" ON "users"("voiceMemoId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_voiceMemoId_fkey" FOREIGN KEY ("voiceMemoId") REFERENCES "voice_memos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vibe_tags" ADD CONSTRAINT "user_vibe_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vibe_tags" ADD CONSTRAINT "user_vibe_tags_vibeTagId_fkey" FOREIGN KEY ("vibeTagId") REFERENCES "vibe_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_exchanges" ADD CONSTRAINT "prompt_exchanges_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_exchanges" ADD CONSTRAINT "prompt_exchanges_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ice_breaker_games" ADD CONSTRAINT "ice_breaker_games_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_playlists" ADD CONSTRAINT "shared_playlists_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_checkins" ADD CONSTRAINT "date_checkins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_checkins" ADD CONSTRAINT "date_checkins_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_checkins" ADD CONSTRAINT "mood_checkins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
