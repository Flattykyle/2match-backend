-- AlterTable: add startedBy, guessA, guessB fields; make payloadA/payloadB nullable
ALTER TABLE "ice_breaker_games" ADD COLUMN "startedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ice_breaker_games" ADD COLUMN "guessA" JSONB;
ALTER TABLE "ice_breaker_games" ADD COLUMN "guessB" JSONB;
ALTER TABLE "ice_breaker_games" ALTER COLUMN "payloadA" DROP NOT NULL;
ALTER TABLE "ice_breaker_games" ALTER COLUMN "payloadB" DROP NOT NULL;

-- Remove the default after backfill (startedBy should always be set by application)
ALTER TABLE "ice_breaker_games" ALTER COLUMN "startedBy" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "ice_breaker_games" ADD CONSTRAINT "ice_breaker_games_startedBy_fkey" FOREIGN KEY ("startedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add aiStarterRegenerations to matches
ALTER TABLE "matches" ADD COLUMN "aiStarterRegenerations" INTEGER NOT NULL DEFAULT 0;
