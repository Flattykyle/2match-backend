import { User } from '@prisma/client'

/**
 * Calculate the Haversine distance between two coordinates in kilometers
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculate age from date of birth
 */
const calculateAge = (dateOfBirth: Date): number => {
  const today = new Date()
  const birthDate = new Date(dateOfBirth)
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

/**
 * Calculate shared items percentage
 * Uses average of both lists to give more balanced scoring
 */
const calculateSharedPercentage = (arr1: string[], arr2: string[]): number => {
  if (arr1.length === 0 && arr2.length === 0) return 0
  if (arr1.length === 0 || arr2.length === 0) return 0

  const set1 = new Set(arr1.map((item) => item.toLowerCase()))
  const set2 = new Set(arr2.map((item) => item.toLowerCase()))
  const intersection = new Set([...set1].filter((x) => set2.has(x)))

  // Use average of both lists for more balanced scoring
  // This prevents high scores when one person has many items and shares just a few
  const averageSize = (set1.size + set2.size) / 2
  return (intersection.size / averageSize) * 100
}

/**
 * Calculate location compatibility score (0-100)
 */
const calculateLocationScore = (
  user1: User,
  user2: User,
  maxDistance: number = 100
): number => {
  // If either user doesn't have location, return 0
  if (
    !user1.latitude ||
    !user1.longitude ||
    !user2.latitude ||
    !user2.longitude
  ) {
    return 0
  }

  const distance = calculateDistance(
    user1.latitude,
    user1.longitude,
    user2.latitude,
    user2.longitude
  )

  // Score decreases linearly with distance
  // 0km = 100%, maxDistance km = 0%
  const score = Math.max(0, 100 - (distance / maxDistance) * 100)
  return score
}

/**
 * Calculate age compatibility score (0-100)
 */
const calculateAgeScore = (user1: User, user2: User): number => {
  const age1 = calculateAge(user1.dateOfBirth)
  const age2 = calculateAge(user2.dateOfBirth)
  const ageDiff = Math.abs(age1 - age2)

  // More nuanced age scoring
  // 0-1 years = 100%
  // 2-3 years = 80%
  // 4-5 years = 60%
  // 6-8 years = 40%
  // 9-12 years = 20%
  // 13+ years = 0%
  if (ageDiff <= 1) return 100
  if (ageDiff <= 3) return 80
  if (ageDiff <= 5) return 60
  if (ageDiff <= 8) return 40
  if (ageDiff <= 12) return 20
  return 0
}

/**
 * Calculate looking for compatibility (0-100)
 */
const calculateLookingForScore = (user1: User, user2: User): number => {
  const lookingFor1 = user1.lookingFor.toLowerCase()
  const lookingFor2 = user2.lookingFor.toLowerCase()

  // More nuanced scoring
  // Exact match = 100%
  // One person wants "both" and other wants specific = 70%
  // Complete mismatch = 0%
  if (lookingFor1 === lookingFor2) return 100
  if (lookingFor1 === 'both' || lookingFor2 === 'both') return 70

  // Complete mismatch (one wants dating, other wants hookup)
  return 0
}

/**
 * Check if users match preferences
 */
export const matchesPreferences = (user: User, targetUser: User): boolean => {
  const preferences = user.preferences as any

  // If no preferences set, match everyone
  if (!preferences) return true

  // Check gender preference
  if (preferences.genderPreference && preferences.genderPreference !== 'any') {
    if (targetUser.gender.toLowerCase() !== preferences.genderPreference.toLowerCase()) {
      return false
    }
  }

  // Check age range
  if (preferences.ageMin || preferences.ageMax) {
    const targetAge = calculateAge(targetUser.dateOfBirth)
    if (preferences.ageMin && targetAge < preferences.ageMin) return false
    if (preferences.ageMax && targetAge > preferences.ageMax) return false
  }

  // Check distance
  if (preferences.distance && user.latitude && user.longitude && targetUser.latitude && targetUser.longitude) {
    const distance = calculateDistance(
      user.latitude,
      user.longitude,
      targetUser.latitude,
      targetUser.longitude
    )
    if (distance > preferences.distance) return false
  }

  return true
}

/**
 * Calculate overall compatibility score between two users
 * Returns a score from 0-100
 */
export const calculateCompatibility = (user1: User, user2: User): number => {
  // Adjusted weights for more realistic scoring (should sum to 100)
  const weights = {
    hobbies: 35,      // Shared interests are important
    talents: 25,      // Shared skills/passions matter
    location: 15,     // Proximity is helpful but not critical
    age: 15,          // Age compatibility matters
    lookingFor: 10,   // Intent alignment is baseline
  }

  // Calculate individual scores
  const hobbiesScore = calculateSharedPercentage(user1.hobbies, user2.hobbies)
  const talentsScore = calculateSharedPercentage(user1.talents, user2.talents)
  const locationScore = calculateLocationScore(user1, user2)
  const ageScore = calculateAgeScore(user1, user2)
  const lookingForScore = calculateLookingForScore(user1, user2)

  // Calculate weighted average
  const totalScore =
    (hobbiesScore * weights.hobbies +
      talentsScore * weights.talents +
      locationScore * weights.location +
      ageScore * weights.age +
      lookingForScore * weights.lookingFor) /
    100

  return Math.round(totalScore)
}

/**
 * Get compatibility breakdown for display
 */
export const getCompatibilityBreakdown = (user1: User, user2: User) => {
  const hobbiesScore = calculateSharedPercentage(user1.hobbies, user2.hobbies)
  const talentsScore = calculateSharedPercentage(user1.talents, user2.talents)
  const locationScore = calculateLocationScore(user1, user2)
  const ageScore = calculateAgeScore(user1, user2)
  const lookingForScore = calculateLookingForScore(user1, user2)
  const overallScore = calculateCompatibility(user1, user2)

  // Get shared items
  const sharedHobbies = user1.hobbies.filter((h) =>
    user2.hobbies.some((h2) => h2.toLowerCase() === h.toLowerCase())
  )
  const sharedTalents = user1.talents.filter((t) =>
    user2.talents.some((t2) => t2.toLowerCase() === t.toLowerCase())
  )

  // Calculate distance if locations available
  let distance: number | null = null
  if (user1.latitude && user1.longitude && user2.latitude && user2.longitude) {
    distance = calculateDistance(
      user1.latitude,
      user1.longitude,
      user2.latitude,
      user2.longitude
    )
  }

  return {
    overallScore,
    breakdown: {
      hobbies: Math.round(hobbiesScore),
      talents: Math.round(talentsScore),
      location: Math.round(locationScore),
      age: Math.round(ageScore),
      lookingFor: Math.round(lookingForScore),
    },
    sharedHobbies,
    sharedTalents,
    distance: distance ? Math.round(distance) : null,
  }
}
