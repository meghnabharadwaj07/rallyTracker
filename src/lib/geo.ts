const EARTH_RADIUS_METERS = 6371000;

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/** Initial bearing from point A to B, degrees clockwise from north [0, 360). */
export function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = (Math.atan2(y, x) * 180) / Math.PI;
  return (θ + 360) % 360;
}

/** Offset a lat/lng by bearing (deg) and distance (m). */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const δ = distanceMeters / EARTH_RADIUS_METERS;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lng);

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * sinδ * cosφ1,
      cosδ - sinφ1 * Math.sin(φ2),
    );

  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

export type LatLng = { lat: number; lng: number };

export type Gate = {
  lat: number;
  lng: number;
  /** Direction of the gate line across the road, degrees clockwise from north. */
  bearingDegrees: number;
  /** Full breadth of the gate across the road, in meters. */
  rangeMeters: number;
};

/** Normalize bearing into [0, 360). */
export function normalizeBearing(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

/** Two endpoints of a road gate line centered at the control point. */
export function gateEndpoints(gate: Gate): [LatLng, LatLng] {
  const half = Math.max(gate.rangeMeters, 1) / 2;
  const bearing = normalizeBearing(gate.bearingDegrees);
  const a = destinationPoint(gate.lat, gate.lng, bearing, half);
  const b = destinationPoint(gate.lat, gate.lng, bearing + 180, half);
  return [a, b];
}

type Vec2 = { x: number; y: number };

/** Local equirectangular meters relative to an origin lat/lng. */
function toLocalMeters(
  originLat: number,
  originLng: number,
  lat: number,
  lng: number,
): Vec2 {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cosLat = Math.cos(toRad(originLat));
  return {
    x: toRad(lng - originLng) * EARTH_RADIUS_METERS * cosLat,
    y: toRad(lat - originLat) * EARTH_RADIUS_METERS,
  };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Proper/improper intersection of segments AB and CD in 2D.
 *  Returns the parameter t along AB in [0, 1] if they intersect, else null. */
function segmentIntersectionT(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): number | null {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;

  const denom = cross(abx, aby, cdx, cdy);
  if (Math.abs(denom) < 1e-12) {
    // Parallel / collinear — treat as no crossing for timing purposes
    return null;
  }

  const t = cross(acx, acy, cdx, cdy) / denom;
  const u = cross(acx, acy, abx, aby) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/** True when the GPS path segment from prev → curr crosses the gate line. */
export function pathCrossesGate(
  prev: LatLng,
  curr: LatLng,
  gate: Gate,
): boolean {
  return gateCrossingT(prev, curr, gate) !== null;
}

/**
 * If prev→curr crosses the gate, returns how far along that path the
 * crossing occurs (0 = at prev, 1 = at curr). Otherwise null.
 */
export function gateCrossingT(
  prev: LatLng,
  curr: LatLng,
  gate: Gate,
): number | null {
  const [endA, endB] = gateEndpoints(gate);
  const a = toLocalMeters(gate.lat, gate.lng, prev.lat, prev.lng);
  const b = toLocalMeters(gate.lat, gate.lng, curr.lat, curr.lng);
  const c = toLocalMeters(gate.lat, gate.lng, endA.lat, endA.lng);
  const d = toLocalMeters(gate.lat, gate.lng, endB.lat, endB.lng);
  return segmentIntersectionT(a, b, c, d);
}

/** Shortest distance from a point to the finite gate segment, in meters. */
export function distanceToGateMeters(point: LatLng, gate: Gate): number {
  const [endA, endB] = gateEndpoints(gate);
  const p = toLocalMeters(gate.lat, gate.lng, point.lat, point.lng);
  const a = toLocalMeters(gate.lat, gate.lng, endA.lat, endA.lng);
  const b = toLocalMeters(gate.lat, gate.lng, endB.lat, endB.lng);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq < 1e-12) {
    return Math.hypot(apx, apy);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closestX = a.x + t * abx;
  const closestY = a.y + t * aby;
  return Math.hypot(p.x - closestX, p.y - closestY);
}
