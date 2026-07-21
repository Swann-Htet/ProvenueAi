// Interim data layer (IMPLEMENTATION.md §4.2): Google Sheets tabs keyed by
// zone id. When GOOGLE_SHEETS_ID + GOOGLE_API_KEY are set, rows are read from
// the live sheet (tabs: FootTraffic, SpendingRange, SupplierMap, NearbyPOI)
// and cached; otherwise the bundled seed zones serve the same contract.
//
// Roadmap note: replace each getter's inner source with a dedicated API
// client (True mobility API etc.) without changing these signatures.

import { findZone, nearestZone } from '../seed/zones.js';
import { getDatasets } from '../store.js';

const SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const SHEETS_KEY = process.env.GOOGLE_API_KEY;
const CACHE_TTL_MS = 1000 * 60 * 60 * 3; // "every few hours" sync cadence

const cache = new Map(); // tab -> { at, rows }

async function readTab(tab) {
  const hit = cache.get(tab);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${tab}?key=${SHEETS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheets read failed for tab ${tab}: ${res.status}`);
  const json = await res.json();
  const [header, ...rows] = json.values || [];
  const parsed = rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  cache.set(tab, { at: Date.now(), rows: parsed });
  return parsed;
}

const liveMode = Boolean(SHEETS_ID && SHEETS_KEY);

function zoneFor(zoneIdOrCoord) {
  if (typeof zoneIdOrCoord === 'string') return findZone(zoneIdOrCoord);
  if (zoneIdOrCoord && typeof zoneIdOrCoord.lat === 'number') {
    return nearestZone(zoneIdOrCoord.lat, zoneIdOrCoord.lng);
  }
  return null;
}

async function getRowsFromDatasets(tab) {
  try {
    const datasets = await getDatasets();
    if (!datasets || datasets.length === 0) return null;
    
    // Reverse to check the most recently uploaded dataset first
    for (let i = datasets.length - 1; i >= 0; i--) {
      const ds = datasets[i];
      if (ds[tab] && Array.isArray(ds[tab])) return ds[tab];
      if (ds.data && ds.data[tab] && Array.isArray(ds.data[tab])) return ds.data[tab];
      
      const name = String(ds.name || ds.tab || ds.type || ds.filename || '').toLowerCase();
      if (name.includes(tab.toLowerCase())) {
        if (Array.isArray(ds.data)) return ds.data;
        if (Array.isArray(ds)) return ds;
      }
    }
  } catch (err) {}
  return null;
}

export async function getFootTraffic(zoneRef) {
  const zone = zoneFor(zoneRef);
  if (!zone) return null;

  const dsRows = await getRowsFromDatasets('FootTraffic');
  if (dsRows) {
    const row = dsRows.find((r) => r.zone_id === zone.zone_id);
    if (row) {
      return {
        zone_id: zone.zone_id,
        weekday_hourly: typeof row.weekday_hourly === 'string' ? JSON.parse(row.weekday_hourly) : row.weekday_hourly,
        weekend_hourly: typeof row.weekend_hourly === 'string' ? JSON.parse(row.weekend_hourly) : row.weekend_hourly,
        peak_note: row.peak_note || ''
      };
    }
  }

  if (liveMode) {
    const rows = await readTab('FootTraffic');
    const row = rows.find((r) => r.zone_id === zone.zone_id);
    if (row) {
      return {
        zone_id: zone.zone_id,
        weekday_hourly: JSON.parse(row.weekday_hourly),
        weekend_hourly: JSON.parse(row.weekend_hourly),
        peak_note: row.peak_note || ''
      };
    }
  }
  return { zone_id: zone.zone_id, ...zone.foot_traffic };
}

export async function getSpendingRange(zoneRef) {
  const zone = zoneFor(zoneRef);
  if (!zone) return null;

  const dsRows = await getRowsFromDatasets('SpendingRange');
  if (dsRows) {
    const row = dsRows.find((r) => r.zone_id === zone.zone_id);
    if (row) {
      return {
        zone_id: zone.zone_id,
        avg_income_thb: Number(row.avg_income_thb),
        avg_spend_per_visit_thb: Number(row.avg_spend_per_visit_thb),
        bracket: row.bracket
      };
    }
  }

  if (liveMode) {
    const rows = await readTab('SpendingRange');
    const row = rows.find((r) => r.zone_id === zone.zone_id);
    if (row) {
      return {
        zone_id: zone.zone_id,
        avg_income_thb: Number(row.avg_income_thb),
        avg_spend_per_visit_thb: Number(row.avg_spend_per_visit_thb),
        bracket: row.bracket
      };
    }
  }
  return { zone_id: zone.zone_id, ...zone.spending_range };
}

export async function getSupplierMap(zoneRef) {
  const zone = zoneFor(zoneRef);
  if (!zone) return [];

  const dsRows = await getRowsFromDatasets('SupplierMap');
  if (dsRows) {
    const matched = dsRows.filter((r) => r.zone_id === zone.zone_id);
    if (matched.length) {
      return matched.map((r) => ({
        name: r.name, category: r.category, lat: Number(r.lat), lng: Number(r.lng)
      }));
    }
  }

  if (liveMode) {
    const rows = await readTab('SupplierMap');
    const matched = rows.filter((r) => r.zone_id === zone.zone_id);
    if (matched.length) {
      return matched.map((r) => ({
        name: r.name, category: r.category, lat: Number(r.lat), lng: Number(r.lng)
      }));
    }
  }
  return zone.suppliers;
}

export async function getNearbyPoi(zoneRef) {
  const zone = zoneFor(zoneRef);
  if (!zone) return { competitors: [], transit: [], anchors: [], retail: [], schools: [], hospitals: [] };

  const dsRows = await getRowsFromDatasets('NearbyPOI');
  if (dsRows) {
    const matched = dsRows.filter((r) => r.zone_id === zone.zone_id);
    if (matched.length) {
      const grouped = { competitors: [], transit: [], anchors: [], retail: [], schools: [], hospitals: [] };
      for (const r of matched) {
        (grouped[r.group] ||= []).push({ name: r.name, category: r.category, lat: Number(r.lat), lng: Number(r.lng) });
      }
      return grouped;
    }
  }

  if (liveMode) {
    const rows = await readTab('NearbyPOI');
    const matched = rows.filter((r) => r.zone_id === zone.zone_id);
    if (matched.length) {
      const grouped = { competitors: [], transit: [], anchors: [], retail: [], schools: [], hospitals: [] };
      for (const r of matched) {
        (grouped[r.group] ||= []).push({ name: r.name, category: r.category, lat: Number(r.lat), lng: Number(r.lng) });
      }
      return grouped;
    }
  }
  return zone.poi;
}

export function dataLayerMode() {
  return liveMode ? 'google-sheets' : 'seed';
}
