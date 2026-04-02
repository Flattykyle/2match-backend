# 2-Match Authentication API Documentation

Complete authentication system with JWT access/refresh tokens and password management.

## Base URL
```
http://localhost:3000/api/auth
```

---

## Authentication Endpoints

### 1. Register User
Create a new user account with complete profile information.

**Endpoint:** `POST /register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1995-05-15",
  "gender": "male",
  "lookingFor": "dating",
  "bio": "Optional bio text",
  "locationCity": "New York",
  "locationCountry": "USA",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "hobbies": ["reading", "gaming"],
  "talents": ["coding", "cooking"],
  "interests": ["technology", "music"]
}
```

**Required Fields:**
- `email` - Valid email format
- `password` - Min 8 chars, must contain uppercase, lowercase, and number
- `username` - Unique username
- `firstName` - User's first name
- `lastName` - User's last name
- `dateOfBirth` - Must be 18+ years old
- `gender` - User's gender
- `lookingFor` - "dating", "hookup", or "both"

**Success Response (201):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    // ... other user fields
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Invalid email format
- `400` - Password doesn't meet requirements
- `400` - User must be 18+ years old
- `409` - Email already exists
- `409` - Username already taken

---

### 2. Login
Authenticate existing user and receive tokens.

**Endpoint:** `POST /login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    // ... other user fields (no password)
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Email and password required
- `401` - Invalid credentials

**Token Lifespans:**
- Access Token: 24 hours
- Refresh Token: 30 days

---

### 3. Refresh Access Token
Get a new access token using refresh token when it expires.

**Endpoint:** `POST /refresh-token`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**
```json
{
  "message": "Token refreshed successfully",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**
- `400` - Refresh token required
- `401` - Invalid or expired refresh token
- `401` - Invalid token type

**Note:** Both tokens are regenerated for security.

---

### 4. Get Current User
Retrieve authenticated user's profile information.

**Endpoint:** `GET /me`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Success Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1995-05-15T00:00:00.000Z",
  "gender": "male",
  "lookingFor": "dating",
  "bio": "Optional bio text",
  "locationCity": "New York",
  "locationCountry": "USA",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "profilePictures": [],
  "hobbies": ["reading", "gaming"],
  "talents": ["coding", "cooking"],
  "interests": ["technology", "music"],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "lastActive": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**
- `401` - No token provided
- `401` - Invalid or expired token
- `404` - User not found

---

### 5. Logout
Invalidate refresh token and logout user.

**Endpoint:** `POST /logout`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Success Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

**Error Responses:**
- `401` - Not authenticated

**Note:** This invalidates the refresh token in the database. The client should also delete stored tokens.

---

### 6. Forgot Password
Request a password reset token.

**Endpoint:** `POST /forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent",
  "resetToken": "abc123..." // Only in development mode
}
```

**Error Responses:**
- `400` - Email required
- `400` - Invalid email format

**Note:**
- Always returns success message (security best practice)
- Reset token expires in 1 hour
- In production, token should be sent via email
- In development, token is returned in response for testing

---

### 7. Reset Password
Reset password using the token from forgot password.

**Endpoint:** `POST /reset-password`

**Request Body:**
```json
{
  "token": "abc123...",
  "newPassword": "NewSecurePass123"
}
```

**Success Response (200):**
```json
{
  "message": "Password reset successfully. Please login with your new password."
}
```

**Error Responses:**
- `400` - Token and new password required
- `400` - Password doesn't meet requirements
- `400` - Invalid or expired reset token

**Note:**
- New password must meet same requirements as registration
- All refresh tokens are invalidated after password reset (for security)

---

## Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)

Examples:
- ✅ `SecurePass123`
- ✅ `MyP@ssw0rd`
- ❌ `password` (no uppercase, no number)
- ❌ `Pass123` (less than 8 characters)

---

## Error Response Format

All errors follow this format:

```json
{
  "message": "Error description",
  "code": "ERROR_CODE" // Optional
}
```

### Auth Middleware Error Codes:
- `NO_TOKEN` - Authorization header missing
- `TOKEN_EXPIRED` - Access token has expired (use refresh token)
- `INVALID_TOKEN` - Token is malformed or invalid
- `INVALID_TOKEN_TYPE` - Trying to use refresh token as access token
- `AUTH_FAILED` - General authentication failure

---

## Token Usage

### Access Token
- Short-lived (24 hours)
- Used for API requests
- Include in Authorization header: `Bearer <accessToken>`
- When expired, use refresh token to get new one

### Refresh Token
- Long-lived (30 days)
- Used only for `/refresh-token` endpoint
- Stored securely on client
- Invalidated on logout or password change

### Example Flow:
```
1. Login → Receive accessToken + refreshToken
2. Use accessToken for API calls
3. When accessToken expires (401 with TOKEN_EXPIRED)
4. Call /refresh-token with refreshToken
5. Receive new accessToken + refreshToken
6. Continue using new accessToken
```

---

## Security Features

✅ **Password Hashing** - Bcrypt with 12 salt rounds
✅ **Email Validation** - RFC 5322 standard
✅ **Age Verification** - Must be 18+
✅ **Token Expiration** - Access (24h) & Refresh (30d)
✅ **Token Invalidation** - Logout clears refresh tokens
✅ **Password Reset Security** - 1-hour token expiration
✅ **Timing Attack Prevention** - Same response for existing/non-existing emails
✅ **Token Type Validation** - Prevents refresh token misuse

---

## Testing with cURL

### Register:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123",
    "username": "testuser",
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "1995-01-01",
    "gender": "male",
    "lookingFor": "dating"
  }'
```

### Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123"
  }'
```

### Get Current User:
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token:
```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

### Logout:
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Forgot Password:
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### Reset Password:
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RESET_TOKEN_FROM_EMAIL",
    "newPassword": "NewPass123"
  }'
```

---

## Environment Variables

Required in `.env` file:

```env
# JWT Secret Key
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Node Environment
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/2match
```

---

## Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to strong random string
- [ ] Set `NODE_ENV=production`
- [ ] Remove `resetToken` from forgot-password response
- [ ] Implement email service for password reset
- [ ] Use HTTPS only
- [ ] Implement rate limiting
- [ ] Add request logging
- [ ] Set up monitoring for failed login attempts
- [ ] Configure CORS properly
- [ ] Use secure cookie storage for refresh tokens (optional)

---

## Support

For issues or questions, please refer to the main project documentation.
