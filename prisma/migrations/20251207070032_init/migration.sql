-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL,
    "bio" TEXT,
    "locationCity" TEXT,
    "locationCountry" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "lookingFor" TEXT NOT NULL,
    "profilePictures" TEXT[],
    "hobbies" TEXT[],
    "talents" TEXT[],
    "interests" TEXT[],
    "preferences" JSONB,
    "refreshToken" TEXT,
    "refreshTokenExpiry" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "resetPasswordExpiry" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpiry" TIMESTAMP(3),
    "phoneNumber" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerificationToken" TEXT,
    "photoVerified" BOOLEAN NOT NULL DEFAULT false,
    "photoVerificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "photoVerificationSubmittedAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "userId1" TEXT NOT NULL,
    "userId2" TEXT NOT NULL,
    "compatibilityScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" TEXT NOT NULL,
    "likerId" TEXT NOT NULL,
    "likedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passes" (
    "id" TEXT NOT NULL,
    "passerId" TEXT NOT NULL,
    "passedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedUserId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_gender_idx" ON "users"("gender");

-- CreateIndex
CREATE INDEX "users_lookingFor_idx" ON "users"("lookingFor");

-- CreateIndex
CREATE INDEX "users_lastActive_idx" ON "users"("lastActive");

-- CreateIndex
CREATE INDEX "users_latitude_longitude_idx" ON "users"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "users_isOnline_idx" ON "users"("isOnline");

-- CreateIndex
CREATE INDEX "users_emailVerified_idx" ON "users"("emailVerified");

-- CreateIndex
CREATE INDEX "users_photoVerified_idx" ON "users"("photoVerified");

-- CreateIndex
CREATE INDEX "matches_userId1_idx" ON "matches"("userId1");

-- CreateIndex
CREATE INDEX "matches_userId2_idx" ON "matches"("userId2");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "matches_compatibilityScore_idx" ON "matches"("compatibilityScore");

-- CreateIndex
CREATE INDEX "matches_matchedAt_idx" ON "matches"("matchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "matches_userId1_userId2_key" ON "matches"("userId1", "userId2");

-- CreateIndex
CREATE INDEX "conversations_user1Id_idx" ON "conversations"("user1Id");

-- CreateIndex
CREATE INDEX "conversations_user2Id_idx" ON "conversations"("user2Id");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user1Id_user2Id_key" ON "conversations"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_receiverId_idx" ON "messages"("receiverId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_isRead_idx" ON "messages"("isRead");

-- CreateIndex
CREATE INDEX "messages_sentAt_idx" ON "messages"("sentAt");

-- CreateIndex
CREATE INDEX "likes_likerId_idx" ON "likes"("likerId");

-- CreateIndex
CREATE INDEX "likes_likedUserId_idx" ON "likes"("likedUserId");

-- CreateIndex
CREATE INDEX "likes_createdAt_idx" ON "likes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "likes_likerId_likedUserId_key" ON "likes"("likerId", "likedUserId");

-- CreateIndex
CREATE INDEX "passes_passerId_idx" ON "passes"("passerId");

-- CreateIndex
CREATE INDEX "passes_passedUserId_idx" ON "passes"("passedUserId");

-- CreateIndex
CREATE INDEX "passes_createdAt_idx" ON "passes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "passes_passerId_passedUserId_key" ON "passes"("passerId", "passedUserId");

-- CreateIndex
CREATE INDEX "blocks_blockerId_idx" ON "blocks"("blockerId");

-- CreateIndex
CREATE INDEX "blocks_blockedUserId_idx" ON "blocks"("blockedUserId");

-- CreateIndex
CREATE INDEX "blocks_createdAt_idx" ON "blocks"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blockerId_blockedUserId_key" ON "blocks"("blockerId", "blockedUserId");

-- CreateIndex
CREATE INDEX "profile_views_viewerId_idx" ON "profile_views"("viewerId");

-- CreateIndex
CREATE INDEX "profile_views_viewedUserId_idx" ON "profile_views"("viewedUserId");

-- CreateIndex
CREATE INDEX "profile_views_viewedAt_idx" ON "profile_views"("viewedAt");

-- CreateIndex
CREATE INDEX "reports_reporterId_idx" ON "reports"("reporterId");

-- CreateIndex
CREATE INDEX "reports_reportedUserId_idx" ON "reports"("reportedUserId");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userId1_fkey" FOREIGN KEY ("userId1") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userId2_fkey" FOREIGN KEY ("userId2") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_likerId_fkey" FOREIGN KEY ("likerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_likedUserId_fkey" FOREIGN KEY ("likedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passes" ADD CONSTRAINT "passes_passerId_fkey" FOREIGN KEY ("passerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passes" ADD CONSTRAINT "passes_passedUserId_fkey" FOREIGN KEY ("passedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewedUserId_fkey" FOREIGN KEY ("viewedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
