import crypto from 'crypto'
import prisma from './prisma'

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || ''
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || ''
const ENCRYPTION_KEY = process.env.SPOTIFY_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-me'

// Encryption for Spotify tokens at rest
const ALGORITHM = 'aes-256-gcm'

function getKeyBuffer(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv)
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptToken(encryptedStr: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedStr.split(':')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function getSpotifyAuthUrl(state: string): string {
  const scopes = [
    'user-read-recently-played',
    'user-top-read',
    'playlist-modify-private',
    'playlist-modify-public',
  ].join(' ')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  })

  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Spotify token exchange failed: ${err}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function refreshSpotifyToken(encryptedRefreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const refreshToken = decryptToken(encryptedRefreshToken)

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error('Spotify token refresh failed')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  }
}

/**
 * Get a valid Spotify access token for a user, refreshing if expired.
 */
export async function getValidSpotifyToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      spotifyAccessToken: true,
      spotifyRefreshToken: true,
      spotifyTokenExpiresAt: true,
      spotifyConnected: true,
    },
  })

  if (!user?.spotifyConnected || !user.spotifyAccessToken || !user.spotifyRefreshToken) {
    throw new Error('Spotify not connected')
  }

  // Check if token is still valid (with 60s buffer)
  if (user.spotifyTokenExpiresAt && new Date(user.spotifyTokenExpiresAt) > new Date(Date.now() + 60_000)) {
    return decryptToken(user.spotifyAccessToken)
  }

  // Refresh the token
  const { accessToken, refreshToken, expiresIn } = await refreshSpotifyToken(user.spotifyRefreshToken)
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  await prisma.user.update({
    where: { id: userId },
    data: {
      spotifyAccessToken: encryptToken(accessToken),
      spotifyRefreshToken: encryptToken(refreshToken),
      spotifyTokenExpiresAt: expiresAt,
    },
  })

  return accessToken
}

/**
 * Make an authenticated Spotify API request.
 */
export async function spotifyApiFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const token = await getValidSpotifyToken(userId)

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Spotify API error (${response.status}): ${err}`)
  }

  // Some endpoints return 201 with no body
  const text = await response.text()
  return text ? JSON.parse(text) : null
}
