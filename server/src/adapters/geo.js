// Free-tier geo stack (IMPLEMENTATION.md §4.3): Nominatim for geocoding and
// Overpass for live POIs, both optional. Seed zones act as the offline
// fallback so the app works without network access or API quotas.

import { matchZoneByName, nearestZone } from '../seed/zones.js';

const LIVE_GEO = process.env.LIVE_GEO === '1';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const UA = 'ProvenueAI/0.1 (site-intelligence prototype)';

export async function geocode(area) {
  if (LIVE_GEO) {
    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(area)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const [hit] = await res.json();
        if (hit) return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name, source: 'nominatim' };
      }
    } catch {
      // fall through to seed lookup
    }
  }
  const zone = matchZoneByName(area);
  if (zone) return { lat: zone.center.lat, lng: zone.center.lng, label: zone.label, source: 'seed' };
  return null;
}

const OVERPASS_TAGS = {
  retail: 'shop',
  competitor: 'amenity~"restaurant|cafe|fast_food"',
  transit: 'railway~"station"',
  supplier: 'shop~"wholesale|supermarket"',
  school: 'amenity~"school|kindergarten|university"',
  hospital: 'amenity~"hospital|clinic"'
};

export async function overpassPoi(category, center, radiusM) {
  if (!LIVE_GEO) return null;
  const tag = OVERPASS_TAGS[category];
  if (!tag) return null;
  const q = `[out:json][timeout:10];node[${tag}](around:${radiusM},${center.lat},${center.lng});out body 40;`;
  try {
    const res = await fetch(OVERPASS_URL, { method: 'POST', body: q, headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.elements || []).map((el) => ({
      name: el.tags?.name || `(unnamed ${category})`,
      category,
      lat: el.lat,
      lng: el.lon
    }));
  } catch {
    return null;
  }
}

export function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

export { nearestZone };
