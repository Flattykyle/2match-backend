import { Response } from 'express'
import { AuthRequest } from '../types'
import prisma from '../utils/prisma'

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId },
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        gender: true,
        lookingFor: true,
      },
      take: 50,
    })

    return res.json(users)
  } catch (error) {
    console.error('Get users error:', error)
    return res.status(500).json({ message: 'Error fetching users' })
  }
}

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        gender: true,
        lookingFor: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    return res.json(user)
  } catch (error) {
    console.error('Get user by id error:', error)
    return res.status(500).json({ message: 'Error fetching user' })
  }
}

/**
 * PATCH /api/users/complete-profile
 * Called once after registration — saves the full onboarding wizard payload.
 */
export const completeProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const {
      // Step 1 — basics
      firstName,
      lastName,
      gender,
      pronouns,
      locationCity,
      locationCountry,
      latitude,
      longitude,
      // Step 4 — prompts
      profilePrompts,
      // Step 5 — flags
      greenFlag,
      redFlag,
      currentlyObsessedWith,
      // Step 7 — intention
      intention,
      // Step 8 — slow burn
      slowModeEnabled,
      // Vibe tag IDs (step 6)
      vibeTagIds,
    } = req.body

    // Build user update data
    const updateData: Record<string, any> = {}

    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (gender !== undefined) updateData.gender = gender
    if (pronouns !== undefined) updateData.pronouns = pronouns
    if (locationCity !== undefined) updateData.locationCity = locationCity
    if (locationCountry !== undefined) updateData.locationCountry = locationCountry
    if (latitude !== undefined) updateData.latitude = latitude
    if (longitude !== undefined) updateData.longitude = longitude
    if (profilePrompts !== undefined) updateData.profilePrompts = profilePrompts
    if (greenFlag !== undefined) updateData.greenFlag = greenFlag
    if (redFlag !== undefined) updateData.redFlag = redFlag
    if (currentlyObsessedWith !== undefined) updateData.currentlyObsessedWith = currentlyObsessedWith
    if (intention !== undefined) updateData.intention = intention
    if (slowModeEnabled !== undefined) {
      updateData.slowModeEnabled = slowModeEnabled
      if (slowModeEnabled) updateData.slowModeLimit = 3
    }

    // Update vibe tags (M2M)
    if (Array.isArray(vibeTagIds)) {
      updateData.userVibeTags = {
        deleteMany: {},
        create: vibeTagIds.map((id: string) => ({ vibeTagId: id })),
      }
    }

    // Note: `pronouns` and `profilePrompts` fields require running
    // `npx prisma migrate dev` after the schema change.
    const updatedUser = await (prisma.user.update as any)({
      where: { id: req.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        pronouns: true,
        bio: true,
        profilePrompts: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        lookingFor: true,
        intention: true,
        greenFlag: true,
        redFlag: true,
        currentlyObsessedWith: true,
        slowModeEnabled: true,
        slowModeLimit: true,
        voiceIntroUrl: true,
        voiceIntroDuration: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return res.json({ message: 'Profile completed', user: updatedUser })
  } catch (error) {
    console.error('Complete profile error:', error)
    return res.status(500).json({ message: 'Error completing profile' })
  }
}

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const { firstName, lastName, dateOfBirth, bio, locationCity, locationCountry, latitude, longitude, hobbies, talents, interests, gender, lookingFor } = req.body

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(dateOfBirth && { dateOfBirth }),
        ...(bio !== undefined && { bio }),
        ...(locationCity !== undefined && { locationCity }),
        ...(locationCountry !== undefined && { locationCountry }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(hobbies !== undefined && { hobbies }),
        ...(talents !== undefined && { talents }),
        ...(interests !== undefined && { interests }),
        ...(gender !== undefined && { gender }),
        ...(lookingFor !== undefined && { lookingFor }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        gender: true,
        lookingFor: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return res.json(updatedUser)
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ message: 'Error updating profile' })
  }
}
