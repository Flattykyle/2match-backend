import { Request } from 'express'

export interface AuthRequest extends Request {
  userId?: string
}

export interface JwtPayload {
  userId: string
}

export interface LoginDto {
  identifier: string
  password: string
}

export interface RegisterDto {
  email: string
  password: string
  username: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  lookingFor: string
  bio?: string
  locationCity?: string
  locationCountry?: string
  latitude?: number
  longitude?: number
  hobbies?: string[]
  talents?: string[]
  interests?: string[]
}

export interface UserPreferences {
  ageMin: number
  ageMax: number
  distance: number
  genderPreference: string
}

export interface UpdateProfileDto {
  firstName?: string
  lastName?: string
  bio?: string
  locationCity?: string
  locationCountry?: string
  latitude?: number
  longitude?: number
  hobbies?: string[]
  talents?: string[]
  interests?: string[]
  lookingFor?: string
  gender?: string
  preferences?: UserPreferences
}

export interface PhotoUploadResponse {
  url: string
  message: string
}
