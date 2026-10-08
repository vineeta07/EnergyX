// Geospatial + logistics helpers. Road distance is approximated as
// great-circle distance x a detour factor; in AWS mode this is replaced by
// Amazon Location Service CalculateRouteMatrix (see services/aiClient.ts).
export const ROAD_FACTOR = 1.25;
export const AVG_SPEED_KMH = 28; // Delhi urban average for medium trucks
export const DIESEL_KG_CO2_PER_L = 2.68;
export const DIESEL_INR_PER_L = 92;
export const TRANSPORT_FIXED_INR = 400;
export const TRANSPORT_INR_PER_KM = 36;
export const TRUCK_KG_CO2_PER_KM = 0.85;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const roadKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineKm(a, b) * ROAD_FACTOR;

/** Point at a given road distance (km) and bearing (deg) from origin. */
export function offsetByRoadKm(origin: { lat: number; lng: number }, road: number, bearingDeg: number) {
  const dist = road / ROAD_FACTOR / 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist) + Math.cos(lat1) * Math.sin(dist) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dist) * Math.cos(lat1), Math.cos(dist) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function transportCost(km: number) {
  return TRANSPORT_FIXED_INR + TRANSPORT_INR_PER_KM * km;
}
export function transportCo2(km: number) {
  return 6 + TRUCK_KG_CO2_PER_KM * km;
}

export const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
