import { Router, Response } from 'express'
import { AuthRequest } from '../types'
import { authenticate } from '../middleware/auth'
import { checkPremium } from '../middleware/premiumGuard'
import prisma from '../utils/prisma'
import { spotifyApiFetch } from '../utils/spotify'
import { getSocketIO } from '../socket/socket'

const router = Router()

// All playlist routes require premium
router.use(authenticate, checkPremium('shared_playlist'))

// ----------------------------------------
// POST /api/playlist/:matchId/create
// ----------------------------------------
router.post('/:matchId/create', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    const { matchId } = req.params

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
      include: {
        user1: { select: { id: true, firstName: true, spotifyConnected: true } },
        user2: { select: { id: true, firstName: true, spotifyConnected: true } },
        sharedPlaylist: true,
      },
    })

    if (!match) return res.status(404).json({ error: 'Match not found' })

    if (match.sharedPlaylist) {
      return res.status(400).json({ error: 'Playlist already exists' })
    }

    if (!match.user1.spotifyConnected || !match.user2.spotifyConnected) {
      return res.status(400).json({ error: 'Both users must have Spotify connected' })
    }

    const playlistName = 'Our 2-Match Vibe \uD83C\uDFB5'

    // Create playlist in user1's Spotify account
    const me1 = await spotifyApiFetch(match.userId1, '/me')
    const playlist1 = await spotifyApiFetch(match.userId1, `/users/${me1.id}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: playlistName,
        description: `Shared playlist with ${match.user2.firstName}`,
        public: false,
      }),
    })

    // Create playlist in user2's Spotify account
    const me2 = await spotifyApiFetch(match.userId2, '/me')
    const playlist2 = await spotifyApiFetch(match.userId2, `/users/${me2.id}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: playlistName,
        description: `Shared playlist with ${match.user1.firstName}`,
        public: false,
      }),
    })

    // Create SharedPlaylist record
    const sharedPlaylist = await prisma.sharedPlaylist.create({
      data: {
        matchId,
        spotifyPlaylistIdUser1: playlist1.id,
        spotifyPlaylistIdUser2: playlist2.id,
        tracks: [],
      },
    })

    // Mark match as playlist created
    await prisma.match.update({
      where: { id: matchId },
      data: { playlistCreated: true },
    })

    return res.status(201).json(sharedPlaylist)
  } catch (error) {
    console.error('Create playlist error:', error)
    return res.status(500).json({ error: 'Failed to create playlist' })
  }
})

// ----------------------------------------
// POST /api/playlist/:matchId/add-track
// ----------------------------------------
router.post('/:matchId/add-track', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    const { matchId } = req.params
    const { spotifyId } = req.body

    if (!spotifyId) return res.status(400).json({ error: 'spotifyId is required' })

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
      include: {
        user1: { select: { id: true, firstName: true } },
        user2: { select: { id: true, firstName: true } },
        sharedPlaylist: true,
      },
    })

    if (!match) return res.status(404).json({ error: 'Match not found' })
    if (!match.sharedPlaylist) return res.status(400).json({ error: 'Playlist not created yet' })

    const tracks = (match.sharedPlaylist.tracks as any[]) || []

    // Check max 20 tracks per user
    const userTrackCount = tracks.filter((t: any) => t.addedBy === req.userId).length
    if (userTrackCount >= 20) {
      return res.status(400).json({ error: 'Maximum 20 tracks per user' })
    }

    // Check duplicate
    if (tracks.some((t: any) => t.spotifyId === spotifyId)) {
      return res.status(400).json({ error: 'Track already in playlist' })
    }

    // Fetch track info from Spotify
    const trackData = await spotifyApiFetch(req.userId, `/tracks/${spotifyId}`)

    const newTrack = {
      spotifyId: trackData.id,
      name: trackData.name,
      artist: trackData.artists.map((a: any) => a.name).join(', '),
      albumArt: trackData.album.images?.[1]?.url || trackData.album.images?.[0]?.url || null,
      previewUrl: trackData.preview_url,
      addedBy: req.userId,
      addedByName: match.userId1 === req.userId ? match.user1.firstName : match.user2.firstName,
      addedAt: new Date().toISOString(),
    }

    const updatedTracks = [...tracks, newTrack]

    // Add to both Spotify playlists
    const trackUri = `spotify:track:${spotifyId}`

    if (match.sharedPlaylist.spotifyPlaylistIdUser1) {
      try {
        await spotifyApiFetch(match.userId1, `/playlists/${match.sharedPlaylist.spotifyPlaylistIdUser1}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ uris: [trackUri] }),
        })
      } catch (e) {
        console.error('Failed to add track to user1 playlist:', e)
      }
    }

    if (match.sharedPlaylist.spotifyPlaylistIdUser2) {
      try {
        await spotifyApiFetch(match.userId2, `/playlists/${match.sharedPlaylist.spotifyPlaylistIdUser2}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ uris: [trackUri] }),
        })
      } catch (e) {
        console.error('Failed to add track to user2 playlist:', e)
      }
    }

    // Update SharedPlaylist.tracks
    await prisma.sharedPlaylist.update({
      where: { id: match.sharedPlaylist.id },
      data: { tracks: updatedTracks },
    })

    // Emit socket event
    const io = getSocketIO()
    if (io) {
      io.to(`match:${matchId}`).emit('playlist:track_added', {
        track: newTrack,
        addedBy: req.userId,
      })
    }

    return res.status(201).json({ track: newTrack })
  } catch (error) {
    console.error('Add track error:', error)
    return res.status(500).json({ error: 'Failed to add track' })
  }
})

// ----------------------------------------
// GET /api/playlist/:matchId
// ----------------------------------------
router.get('/:matchId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' })

    const { matchId } = req.params

    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userId1: req.userId }, { userId2: req.userId }],
      },
      include: {
        user1: { select: { id: true, firstName: true, spotifyConnected: true } },
        user2: { select: { id: true, firstName: true, spotifyConnected: true } },
        sharedPlaylist: true,
      },
    })

    if (!match) return res.status(404).json({ error: 'Match not found' })

    return res.json({
      playlist: match.sharedPlaylist,
      user1: { id: match.userId1, firstName: match.user1.firstName, spotifyConnected: match.user1.spotifyConnected },
      user2: { id: match.userId2, firstName: match.user2.firstName, spotifyConnected: match.user2.spotifyConnected },
      playlistCreated: match.playlistCreated,
    })
  } catch (error) {
    console.error('Get playlist error:', error)
    return res.status(500).json({ error: 'Failed to get playlist' })
  }
})

export default router
