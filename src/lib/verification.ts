// Decides on the server whether an upload earns the "verified" badge.
// The app reads GPS from the photo in the browser and sends is_verified,
// so on its own that flag can be faked by anyone sending their own request.
// These checks stop the easy fakes. A determined person could still forge
// photo metadata; reading the EXIF on the server is the stronger next step.

const EARTH_RADIUS_M = 6371000

// How far a verified photo may be from the spot it's added to.
export const MAX_SPOT_DISTANCE_M = 300

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  if (lat === 0 && lng === 0) return false
  return true
}

export interface VerificationInput {
  claimedVerified: boolean
  lat: number | null
  lng: number | null
  takenAt?: string | null
  // The existing spot the photo is being added to, if any
  spot?: { latitude: number; longitude: number } | null
  now?: Date
}

export interface VerificationResult {
  verified: boolean
  reason: string | null // why the claim was rejected, for logs
}

export function decideVerified(input: VerificationInput): VerificationResult {
  const { claimedVerified, lat, lng, takenAt, spot } = input
  const now = input.now ?? new Date()

  if (!claimedVerified) return { verified: false, reason: null }

  if (!isValidCoordinate(lat, lng)) {
    return { verified: false, reason: 'missing or invalid GPS coordinates' }
  }

  if (takenAt) {
    // taken_at is a local wall-clock time with no zone, so allow a day either way.
    const t = Date.parse(takenAt)
    if (Number.isNaN(t)) return { verified: false, reason: 'unreadable taken_at' }
    if (t > now.getTime() + 24 * 3600 * 1000) return { verified: false, reason: 'taken_at is in the future' }
    if (t < Date.UTC(2000, 0, 1)) return { verified: false, reason: 'taken_at is before 2000' }
  }

  if (spot && isValidCoordinate(spot.latitude, spot.longitude)) {
    const d = distanceMeters(lat as number, lng as number, spot.latitude, spot.longitude)
    if (d > MAX_SPOT_DISTANCE_M) {
      return { verified: false, reason: `photo is ${Math.round(d)} m from the spot` }
    }
  }

  return { verified: true, reason: null }
}
