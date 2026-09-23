// Great-circle distance in km for nearest-first facility sorting; display only, so straight-line distance is fine and the UI says "away", not "drive".
const EARTH_RADIUS_KM = 6371;

// Converts degrees to radians.
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Returns the haversine distance in kilometres between two coordinates.
export function haversineKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Formats a distance for display.
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}
