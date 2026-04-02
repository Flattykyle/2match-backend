import { Response } from 'express'
import { AuthRequest, UpdateProfileDto } from '../types'
import prisma from '../utils/prisma'
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary'
import { calculateProfileCompletion } from '../utils/profileCompletion'

// ----------------------------------------
// GET PROFILE COMPLETION
// ----------------------------------------
export const getProfileCompletion = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const completion = calculateProfileCompletion(user)

    res.json(completion)
  } catch (error) {
    console.error('Get profile completion error:', error)
    res.status(500).json({ message: 'Error calculating profile completion' })
  }
}

// ----------------------------------------
// UPLOAD PROFILE PHOTO
// ----------------------------------------
export const uploadProfilePhoto = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' })
      return
    }

    // Get current user to check photo count
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { profilePictures: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Check if user already has 6 photos
    if (user.profilePictures.length >= 6) {
      res.status(400).json({ message: 'Maximum of 6 photos allowed' })
      return
    }

    // Upload to Cloudinary
    let imageUrl: string
    try {
      imageUrl = await uploadToCloudinary(req.file.buffer)
    } catch (uploadError: any) {
      console.error('Cloudinary upload error:', uploadError)
      res.status(500).json({
        message: 'Error uploading to cloud storage. Please check Cloudinary credentials in .env file.',
        details: process.env.NODE_ENV === 'development' ? uploadError.message : undefined
      })
      return
    }

    // Add photo to user's profile
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        profilePictures: {
          push: imageUrl,
        },
      },
    })

    res.status(201).json({
      url: imageUrl,
      message: 'Photo uploaded successfully',
    })
  } catch (error) {
    console.error('Upload photo error:', error)
    res.status(500).json({ message: 'Error uploading photo' })
  }
}

// ----------------------------------------
// DELETE PROFILE PHOTO
// ----------------------------------------
export const deleteProfilePhoto = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { photoUrl } = req.body

    if (!photoUrl) {
      res.status(400).json({ message: 'Photo URL is required' })
      return
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { profilePictures: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Check if photo exists in user's profile
    if (!user.profilePictures.includes(photoUrl)) {
      res.status(404).json({ message: 'Photo not found in profile' })
      return
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(photoUrl)

    // Remove photo from user's profile
    const updatedPhotos = user.profilePictures.filter((url) => url !== photoUrl)

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        profilePictures: updatedPhotos,
      },
    })

    res.json({ message: 'Photo deleted successfully' })
  } catch (error) {
    console.error('Delete photo error:', error)
    res.status(500).json({ message: 'Error deleting photo' })
  }
}

// ----------------------------------------
// REORDER PROFILE PHOTOS
// ----------------------------------------
export const reorderProfilePhotos = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const { photoUrls } = req.body

    if (!photoUrls || !Array.isArray(photoUrls)) {
      res.status(400).json({ message: 'Photo URLs array is required' })
      return
    }

    if (photoUrls.length > 6) {
      res.status(400).json({ message: 'Maximum of 6 photos allowed' })
      return
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { profilePictures: true },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    // Verify all URLs belong to the user
    const allUrlsValid = photoUrls.every((url) =>
      user.profilePictures.includes(url)
    )

    if (!allUrlsValid) {
      res.status(400).json({ message: 'Invalid photo URLs provided' })
      return
    }

    // Update photo order
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        profilePictures: photoUrls,
      },
    })

    res.json({ message: 'Photos reordered successfully', photoUrls })
  } catch (error) {
    console.error('Reorder photos error:', error)
    res.status(500).json({ message: 'Error reordering photos' })
  }
}

// ----------------------------------------
// UPDATE PROFILE
// ----------------------------------------
export const updateProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ message: 'Not authenticated' })
      return
    }

    const updateData: UpdateProfileDto = req.body

    // Validate bio length if provided
    if (updateData.bio && updateData.bio.length > 500) {
      res.status(400).json({ message: 'Bio must be 500 characters or less' })
      return
    }

    // Build update object
    const dataToUpdate: any = {}

    if (updateData.firstName !== undefined) dataToUpdate.firstName = updateData.firstName
    if (updateData.lastName !== undefined) dataToUpdate.lastName = updateData.lastName
    if (updateData.bio !== undefined) dataToUpdate.bio = updateData.bio
    if (updateData.locationCity !== undefined) dataToUpdate.locationCity = updateData.locationCity
    if (updateData.locationCountry !== undefined) dataToUpdate.locationCountry = updateData.locationCountry
    if (updateData.latitude !== undefined) dataToUpdate.latitude = updateData.latitude
    if (updateData.longitude !== undefined) dataToUpdate.longitude = updateData.longitude
    if (updateData.hobbies !== undefined) dataToUpdate.hobbies = updateData.hobbies
    if (updateData.talents !== undefined) dataToUpdate.talents = updateData.talents
    if (updateData.interests !== undefined) dataToUpdate.interests = updateData.interests
    if (updateData.lookingFor !== undefined) dataToUpdate.lookingFor = updateData.lookingFor
    if (updateData.gender !== undefined) dataToUpdate.gender = updateData.gender
    if (updateData.preferences !== undefined) dataToUpdate.preferences = updateData.preferences

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        lookingFor: true,
        bio: true,
        locationCity: true,
        locationCountry: true,
        latitude: true,
        longitude: true,
        profilePictures: true,
        hobbies: true,
        talents: true,
        interests: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    res.json(updatedUser)
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ message: 'Error updating profile' })
  }
}
