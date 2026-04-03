import { Router, Response } from 'express'
import crypto from 'crypto'
import { AuthRequest } from '../types'
import { authenticate } from '../middleware/auth'
import prisma from '../utils/prisma'
import {
  getSpotifyAuthUrl,
  exchangeCodeForTokens,
  encryptToken,
  spotifyApiFetch,
} from '../utils/spotify'

const router = Router()

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// ----------------------------------------
// GET /api/spotify/auth — redirect to Spotify
// ----------------------------------------
router.get('/auth', authenticate, (req: AuthRequest, res: Response) => {
  const state = `${req.userId}:${crypto.randomBytes(16).toString('hex')}`
  const url = getSpotifyAuthUrl(state)
  res.json({ url })
})

// ----------------------------------------
// GET /api/spotify/callback — exchange code
// ----------------------------------------
router.get('/callback', async (req: AuthRequest, res: Response) => {
  try {
    const { code, state, error: spotifyError } = req.query as Record<string, string>

    if (spotifyError) {
      return res.redirect(`${FRONTEND_URL}/settings?spotify=error&reason=${spotifyError}`)
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/settings?spotify=error&reason=missing_params`)
    }

    const userId = state.split(':')[0]
    if (!userId) {
      return res.redirect(`${FRONTEND_URL}/settings?spotify=error&reason=invalid_state`)
    }

    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForTokens(code)
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    await prisma.user.update({
      where: { id: userId },
      data: {
        spotifyConnected: true,
        spotifyAccessToken: encryptToken(accessToken),
        spotifyRefreshToken: encryptToken(refreshToken),
        spotifyTokenExpiresAt: expiresAt,
      },
    })

    return res.redirect(`${FRONTEND_URL}/settings?spotify=connected`)
  } catch (error) {
    console.error('Spotify callback error:', error)
    return res.redirect(`${FRONTEND_URL}/settings?spotify=error&reason=token_exchange`)
  }
})

// ----------------------------------------
// GET /api/spotify/top-tracks
// ----------------------------------------
router.get('/top-tracks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    const data = await spotifyApiFetch(req.userId, '/me/top/tracks?limit=3&time_range=short_term')

    const tracks = data.items.map((track: any) => ({
      name: track.name,
      artist: track.artists.map((a: any) => a.name).join(', '),
      albumArt: track.album.images?.[0]?.url || null,
      previewUrl: track.preview_url,
      spotifyId: track.id,
    }))

    return res.json(tracks)
  } catch (error: any) {
    console.error('Get top tracks error:', error)
    if (error.message === 'Spotify not connected') {
      return res.status(400).json({ error: 'Spotify not connected' })
    }
    return res.status(500).json({ error: 'Failed to fetch top tracks' })
  }
})

// ----------------------------------------
// GET /api/spotify/search?q=...
// ----------------------------------------
router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    const { q } = req.query as Record<string, string>
    if (!q || !q.trim()) return res.json([])

    const data = await spotifyApiFetch(
      req.userId,
      `/search?q=${encodeURIComponent(q)}&type=track&limit=10`
    )

    const tracks = data.tracks.items.map((track: any) => ({
      name: track.name,
      artist: track.artists.map((a: any) => a.name).join(', '),
      albumArt: track.album.images?.[1]?.url || track.album.images?.[0]?.url || null,
      previewUrl: track.preview_url,
      spotifyId: track.id,
    }))

    return res.json(tracks)
  } catch (error: any) {
    console.error('Spotify search error:', error)
    if (error.message === 'Spotify not connected') {
      return res.status(400).json({ error: 'Spotify not connected' })
    }
    return res.status(500).json({ error: 'Failed to search tracks' })
  }
})

// ----------------------------------------
// POST /api/spotify/refresh — manual refresh
// ----------------------------------------
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    // getValidSpotifyToken handles refresh internally
    const { getValidSpotifyToken } = await import('../utils/spotify')
    await getValidSpotifyToken(req.userId)

    return res.json({ message: 'Token refreshed' })
  } catch (error) {
    console.error('Spotify refresh error:', error)
    return res.status(500).json({ error: 'Failed to refresh token' })
  }
})

export default router
