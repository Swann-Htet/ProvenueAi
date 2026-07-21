// Agent 1: Property Sourcing Agent (AGENTS.md §1).
// Given an area + filters, returns structured candidate listings for admin
// review. Never writes to the Property DB — only the admin confirm endpoint
// does. In this build the "scrape" step draws from a seed listing pool that
// mirrors extraction-pipeline output (including null contacts and varying
// scrape_confidence); the geocode step uses the shared geo adapter.

import { geocode } from '../adapters/geo.js';
import { LISTING_POOL } from '../seed/listings.js';
import { nearestZone } from '../seed/zones.js';

export async function sourceProperties({ area, size_sqm_min, size_sqm_max, budget_rent_max_thb, property_type }) {
  const geo = await geocode(area);
  if (!geo) {
    return {
      results: [],
      queries_used: [],
      note: `Could not resolve area "${area}". Try a Bangkok district like Thonglor, Ekkamai, Ari, Silom, or Phrom Phong.`
    };
  }

  const zone = nearestZone(geo.lat, geo.lng);
  const queries = buildQueries(area, { size_sqm_min, size_sqm_max, budget_rent_max_thb, property_type });

  let rows = LISTING_POOL.filter((l) => l.zone_id === zone.zone_id);

  if (size_sqm_min) rows = rows.filter((l) => l.size_sqm == null || l.size_sqm >= size_sqm_min);
  if (size_sqm_max) rows = rows.filter((l) => l.size_sqm == null || l.size_sqm <= size_sqm_max);
  if (budget_rent_max_thb) rows = rows.filter((l) => l.monthly_rent_thb == null || l.monthly_rent_thb <= budget_rent_max_thb);
  if (property_type?.length) rows = rows.filter((l) => property_type.includes(l.property_type));

  // Guardrail: discard listings missing rent AND size (unusable), dedupe by address.
  const seen = new Set();
  const results = [];
  for (const l of rows) {
    if (l.monthly_rent_thb == null && l.size_sqm == null) continue;
    const key = l.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      property_name: l.property_name,
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      monthly_rent_thb: l.monthly_rent_thb ?? null,
      size_sqm: l.size_sqm ?? null,
      property_type: l.property_type,
      owner_contact: l.owner_contact ?? null,
      source_url: l.source_url,
      scrape_confidence: l.scrape_confidence,
      zone_id: l.zone_id
    });
  }

  results.sort((a, b) => b.scrape_confidence - a.scrape_confidence);

  return {
    results,
    queries_used: queries,
    resolved_area: { ...geo, zone_id: zone.zone_id, zone_label: zone.label },
    note: results.length
      ? null
      : 'No listings matched the filters in this zone. Try widening the size or budget range.'
  };
}

function buildQueries(area, f) {
  const qs = [
    `ให้เช่า ร้านค้า ${area}`,
    `commercial space for rent ${area} site:ddproperty.com`
  ];
  if (f.property_type?.includes('shophouse')) qs.push(`shophouse for rent ${area}`);
  if (f.budget_rent_max_thb) qs.push(`retail rent under ${f.budget_rent_max_thb} THB ${area}`);
  return qs.slice(0, 4);
}
