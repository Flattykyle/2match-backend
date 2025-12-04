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
 * Upload a file buffer to Cloudinary
 * @param fileBuffer - The file buffer to upload
 * @param folder - The folder to upload to (default: 'profile-pictures')
 * @returns The secure URL of the uploaded image
 */
export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  folder: string = 'profile-pictures'
): Promise<string> => {
  // Validate configuration before attempting upload
  validateCloudinaryConfig()

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto:good' },
        ],
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
