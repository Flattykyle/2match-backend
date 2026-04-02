/**
 * Location utility functions for distance calculation and filtering
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const km = calculateDistance(lat1, lon1, lat2, lon2);
  return Math.round(km * 0.621371 * 10) / 10; // Convert to miles and round
}

/**
 * Check if user is within specified distance
 */
export function isWithinDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  maxDistance: number
): boolean {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= maxDistance;
}

/**
 * Format distance for display
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return 'Less than 1 km away';
  } else if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km away`;
  } else {
    return `${Math.round(distanceKm)} km away`;
  }
}

/**
 * Sort users by distance from a reference point
 */
export function sortByDistance<T extends { latitude?: number | null; longitude?: number | null }>(
  users: T[],
  refLat: number,
  refLon: number
): (T & { distance: number })[] {
  return users
    .filter(user => user.latitude != null && user.longitude != null)
    .map(user => ({
      ...user,
      distance: calculateDistance(refLat, refLon, user.latitude!, user.longitude!)
    }))
    .sort((a, b) => a.distance - b.distance);
}
