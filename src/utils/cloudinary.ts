import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

// Validate Cloudinary credentials
const validateCloudinaryConfig = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env

  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === 'your_cloud_name') {
    throw new Error('CLOUDINARY_CLOUD_NAME is not configured in .env file')
  }
  if (!CLOUDINARY_API_KEY || CLOUDINARY_API_KEY === 'your_api_key') {
    throw new Error('CLOUDINARY_API_KEY is not configured in .env file')
  }
  if (!CLOUDINARY_API_SECRET || CLOUDINARY_API_SECRET === 'your_api_secret') {
    throw new Error('CLOUDINARY_API_SECRET is not configured in .env file')
  }
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Upload an image buffer to Cloudinary
 */
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string = 'profile-pictures'
): Promise<string> => {
  validateCloudinaryConfig()

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        // BEFORE: resource_type: 'auto' — could accept non-images
        // AFTER: resource_type: 'image' — rejects non-image uploads at Cloudinary level
        resource_type: 'image',
        // BEFORE: transformation only, no EXIF stripping
        // AFTER: Strip EXIF/metadata with flags, enforce allowed formats
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        // Strip all EXIF metadata (GPS location, camera info, etc.)
        image_metadata: false,
        transformation: [
          {
            // BEFORE: width: 1000, height: 1000
            // AFTER: 800x800 as specified, with EXIF strip flag
            width: 800,
            height: 800,
            crop: 'limit',
            flags: 'strip_profile', // Strips ICC profiles and EXIF data
          },
          { quality: 'auto:good' },
        ],
        // AFTER: Eager transformations — pre-generate the resized version
        eager: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto:good', flags: 'strip_profile' },
          { width: 200, height: 200, crop: 'thumb', gravity: 'face', quality: 'auto:good', flags: 'strip_profile' },
        ],
        eager_async: true,
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else if (result) {
          resolve(result.secure_url)
        } else {
          reject(new Error('Upload failed'))
        }
      }
    )

    const readableStream = new Readable()
    readableStream.push(fileBuffer)
    readableStream.push(null)
    readableStream.pipe(uploadStream)
  })
}

/**
 * Upload an audio buffer to Cloudinary (for voice intros)
 */
export const uploadAudioToCloudinary = async (
  fileBuffer: Buffer,
  folder: string = 'voice-intros'
): Promise<{ url: string; duration: number }> => {
  validateCloudinaryConfig()

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'video', // Cloudinary uses 'video' for audio files
        allowed_formats: ['webm', 'mp4', 'ogg', 'wav'],
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else if (result) {
          resolve({
            url: result.secure_url,
            duration: Math.round(result.duration || 0),
          })
        } else {
          reject(new Error('Upload failed'))
        }
      }
    )

    const readableStream = new Readable()
    readableStream.push(fileBuffer)
    readableStream.push(null)
    readableStream.pipe(uploadStream)
  })
}

/**
 * Delete a resource from Cloudinary by URL (works for both images and audio/video)
 */
export const deleteResourceFromCloudinary = async (
  resourceUrl: string,
  resourceType: 'image' | 'video' = 'image'
): Promise<void> => {
  try {
    const urlParts = resourceUrl.split('/')
    const publicIdWithExtension = urlParts.slice(-2).join('/')
    const publicId = publicIdWithExtension.split('.')[0]

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error)
    throw error
  }
}

/**
 * Delete an image from Cloudinary by URL
 * @param imageUrl - The URL of the image to delete
 */
export const deleteFromCloudinary = async (imageUrl: string): Promise<void> => {
  try {
    // Extract public_id from URL
    // Example URL: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/public_id.jpg
    const urlParts = imageUrl.split('/')
    const publicIdWithExtension = urlParts.slice(-2).join('/')
    const publicId = publicIdWithExtension.split('.')[0]

    await cloudinary.uploader.destroy(publicId)
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error)
    throw error
  }
}

export default cloudinary
