# 2-Match Database Schema

This document describes the complete database schema for the 2-Match dating platform.

## Overview

The database consists of 5 main tables:
1. **Users** - User profiles and authentication
2. **Matches** - Matching relationships between users
3. **Conversations** - Chat conversations between matched users
4. **Messages** - Individual messages within conversations
5. **Likes** - User likes/swipes

## Database Models

### 1. Users Table

Stores user profiles, authentication, and preferences.

**Fields:**
- `id` (UUID) - Primary key
- `email` (String, unique) - User email for authentication
- `password` (String) - Hashed password
- `username` (String, unique) - Unique username

**Personal Information:**
- `firstName` (String) - User's first name
- `lastName` (String) - User's last name
- `dateOfBirth` (DateTime) - Date of birth
- `gender` (String) - User's gender

**Profile Details:**
- `bio` (Text, optional) - User biography/about section
- `locationCity` (String, optional) - City name
- `locationCountry` (String, optional) - Country name
- `latitude` (Float, optional) - GPS latitude coordinate
- `longitude` (Float, optional) - GPS longitude coordinate
- `lookingFor` (String) - Relationship type: 'dating', 'hookup', or 'both'

**Arrays:**
- `profilePictures` (String[]) - Array of image URLs (max 6 enforced in app)
- `hobbies` (String[]) - List of user hobbies
- `talents` (String[]) - List of user talents
- `interests` (String[]) - List of user interests

**Preferences:**
- `preferences` (JSON, optional) - Structured preferences object for matching

**Timestamps:**
- `createdAt` (DateTime) - Account creation timestamp
- `updatedAt` (DateTime) - Last profile update
- `lastActive` (DateTime) - Last activity timestamp

**Indexes:**
- `email`, `username`, `gender`, `lookingFor`, `lastActive`
- Composite index on `(latitude, longitude)` for location-based queries

### 2. Matches Table

Stores matching relationships and compatibility scores.

**Fields:**
- `id` (UUID) - Primary key
- `userId1` (String) - First user ID (foreign key)
- `userId2` (String) - Second user ID (foreign key)
- `compatibilityScore` (Integer) - Match percentage (0-100)
- `status` (String) - Match status: 'pending', 'accepted', or 'rejected'
- `matchedAt` (DateTime) - Timestamp when match was created

**Constraints:**
- Unique constraint on `(userId1, userId2)` pair

**Indexes:**
- `userId1`, `userId2`, `status`, `compatibilityScore`, `matchedAt`

### 3. Conversations Table

Stores conversation metadata between two users.

**Fields:**
- `id` (UUID) - Primary key
- `user1Id` (String) - First user ID (foreign key)
- `user2Id` (String) - Second user ID (foreign key)
- `lastMessageAt` (DateTime, optional) - Timestamp of last message
- `createdAt` (DateTime) - Conversation creation timestamp

**Constraints:**
- Unique constraint on `(user1Id, user2Id)` pair

**Indexes:**
- `user1Id`, `user2Id`, `lastMessageAt`

### 4. Messages Table

Stores individual messages within conversations.

**Fields:**
- `id` (UUID) - Primary key
- `senderId` (String) - Sender user ID (foreign key)
- `receiverId` (String) - Receiver user ID (foreign key)
- `conversationId` (String) - Parent conversation ID (foreign key)
- `content` (Text) - Message content
- `isRead` (Boolean) - Read status (default: false)
- `sentAt` (DateTime) - Message timestamp

**Indexes:**
- `senderId`, `receiverId`, `conversationId`, `isRead`, `sentAt`

### 5. Likes Table

Stores user likes/swipes.

**Fields:**
- `id` (UUID) - Primary key
- `likerId` (String) - User who liked (foreign key)
- `likedUserId` (String) - User who was liked (foreign key)
- `createdAt` (DateTime) - Like timestamp

**Constraints:**
- Unique constraint on `(likerId, likedUserId)` pair

**Indexes:**
- `likerId`, `likedUserId`, `createdAt`

## Relationships

### User Relations
- One user has many matches (as both user1 and user2)
- One user has many conversations (as both user1 and user2)
- One user sends many messages
- One user receives many messages
- One user gives many likes
- One user receives many likes

### Match Relations
- Each match belongs to two users

### Conversation Relations
- Each conversation belongs to two users
- One conversation has many messages

### Message Relations
- Each message belongs to one sender
- Each message belongs to one receiver
- Each message belongs to one conversation

### Like Relations
- Each like belongs to one liker
- Each like belongs to one liked user

## Cascade Deletion

All foreign keys use `ON DELETE CASCADE`, meaning:
- Deleting a user deletes all their matches, conversations, messages, and likes
- Deleting a conversation deletes all its messages

## Running Migrations

### Option 1: Apply Migration (Recommended for existing data)

```bash
cd backend
npx prisma migrate deploy
```

This will apply the migration that handles existing data gracefully.

### Option 2: Reset Database (Clean slate)

If you want to start fresh and don't need existing data:

```bash
cd backend
npx prisma migrate reset
npx prisma migrate dev --name complete_schema
```

### Option 3: Generate Client Only

After migrations are applied, generate the Prisma client:

```bash
cd backend
npx prisma generate
```

## Environment Setup

Ensure your `.env` file contains:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/2match?schema=public"
```

## Performance Considerations

1. **Indexes**: All frequently queried fields have indexes
2. **Location Queries**: Composite index on `(latitude, longitude)` for efficient proximity searches
3. **Unique Constraints**: Prevent duplicate matches and likes
4. **Array Fields**: PostgreSQL native array support for efficient storage
5. **Text Fields**: `bio` and `content` use TEXT type for unlimited length

## Best Practices

1. **Profile Pictures**: Limit to 6 URLs in application logic
2. **Passwords**: Always hash before storing (use bcrypt)
3. **Coordinates**: Store as separate lat/lng fields for better indexing
4. **Compatibility Score**: Store as integer (0-100) for efficiency
5. **Conversations**: Always use LEAST/GREATEST for user IDs to ensure consistency

## Example Queries

### Find Nearby Users
```typescript
const nearbyUsers = await prisma.user.findMany({
  where: {
    latitude: { gte: lat - 0.1, lte: lat + 0.1 },
    longitude: { gte: lng - 0.1, lte: lng + 0.1 },
  }
});
```

### Get User Matches
```typescript
const matches = await prisma.match.findMany({
  where: {
    OR: [
      { userId1: userId },
      { userId2: userId }
    ],
    status: 'accepted'
  }
});
```

### Get Conversation Messages
```typescript
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { sentAt: 'asc' },
  include: {
    sender: { select: { username: true, profilePictures: true } }
  }
});
```

## Troubleshooting

### Permission Errors on Windows
If you encounter `EPERM` errors when running `prisma generate`:
1. Close any running development servers
2. Close VS Code or your IDE
3. Run the command again

### Migration Conflicts
If migrations fail due to existing data:
1. Check the migration SQL file
2. Manually adjust data if needed
3. Or use `prisma migrate reset` for a clean start
