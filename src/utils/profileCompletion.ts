import { User } from '@prisma/client'

interface ProfileCompletionResult {
  percentage: number
  missingFields: string[]
}

/**
 * Calculate profile completion percentage
 * @param user - The user object
 * @returns Object with completion percentage and missing fields
 */
export const calculateProfileCompletion = (user: User): ProfileCompletionResult => {
  const requiredFields = [
    { key: 'firstName', label: 'First Name', weight: 5 },
    { key: 'lastName', label: 'Last Name', weight: 5 },
    { key: 'dateOfBirth', label: 'Date of Birth', weight: 5 },
    { key: 'gender', label: 'Gender', weight: 5 },
    { key: 'lookingFor', label: 'Looking For', weight: 5 },
    { key: 'bio', label: 'Bio', weight: 15 },
    { key: 'locationCity', label: 'Location', weight: 10 },
    { key: 'profilePictures', label: 'Profile Pictures', weight: 25, min: 1 },
    { key: 'hobbies', label: 'Hobbies', weight: 10, min: 1 },
    { key: 'talents', label: 'Talents', weight: 5, min: 1 },
    { key: 'interests', label: 'Interests', weight: 5, min: 1 },
    { key: 'preferences', label: 'Preferences', weight: 5 },
  ]

  let totalWeight = 0
  let completedWeight = 0
  const missingFields: string[] = []

  requiredFields.forEach((field) => {
    totalWeight += field.weight
    const value = user[field.key as keyof User]

    let isComplete = false

    if (Array.isArray(value)) {
      isComplete = value.length >= (field.min || 1)
    } else if (typeof value === 'object' && value !== null) {
      isComplete = Object.keys(value).length > 0
    } else {
      isComplete = value !== null && value !== undefined && value !== ''
    }

    if (isComplete) {
      completedWeight += field.weight
    } else {
      missingFields.push(field.label)
    }
  })

  const percentage = Math.round((completedWeight / totalWeight) * 100)

  return {
    percentage,
    missingFields,
  }
}
