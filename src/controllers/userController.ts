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
