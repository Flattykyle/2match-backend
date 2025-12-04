import multer from 'multer'
import { Request } from 'express'

// Configure multer for memory storage
const storage = multer.memoryStorage()

// File filter to accept only images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'))
  }
}

// Create multer instance with configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
})

// Middleware for single photo upload
export const uploadSingle = upload.single('photo')

// Middleware for multiple photo uploads (max 6)
export const uploadMultiple = upload.array('photos', 6)
