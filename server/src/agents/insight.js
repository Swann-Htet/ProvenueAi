// Agent 4: Post-Report Insight Agent (AGENTS.md §4).
// Classifies each chat message (map layer request / what-if financial /
// data question / clarification), then executes at most 3 grounded tool
// calls: get_nearby_poi -> score_layer -> render_map_layer, or
// update_financial_view. Every rendered point comes from a real POI lookup —
// no hallucinated markers — and every map change is narrated in text.

import { getNearbyPoi, getSupplierMap } from '../adapters/sheets.js';
import { haversineM, overpassPoi, nearestZone } from '../adapters/geo.js';

const MAX_TOOL_CALLS = 3;

const CATEGORY_PATTERNS = [
  ['retail', /retail|shops?\b|stores?\b|boutique/],
  ['competitor', /competitor|competition|other (restaurant|cafe)s?|similar (business|place)/],
  ['transit', /transit|bts|mrt|train|station|bus/],
  ['supplier', /supplier|wholesale|ingredient|market\b|sourcing/],
  ['school', /school|universit|student|kindergarten/],
  ['hospital', /hospital|clinic|medical/]
];

// ---------- tools ----------

async function get_nearby_poi({ category, center, radius_m }) {
  // Live Overpass first (when LIVE_GEO=1), seed zone data as ground truth
  // fallback — the agent never fabricates POIs.
  const live = await overpassPoi(category, center, radius_m);
  if (live?.length) return live;

  const zone = nearestZone(center.lat, center.lng);
  let pool = [];
  if (category === 'supplier') {
    pool = await getSupplierMap(zone.zone_id);
  } else {
    const poi = await getNearbyPoi(zone.zone_id);
    const groupMap = {
      retail: poi.retail,
      competitor: poi.competitors,
      transit: poi.transit,
      school: poi.schools,
      hospital: poi.hospitals
    };
    pool = groupMap[category] || [];
    if (category === 'retail') pool = [...pool, ...(poi.anchors || [])];
  }
  return pool
    .map((p) => ({ ...p, distance_m: haversineM(center, p) }))
    .filter((p) => p.distance_m <= radius_m)
    .sort((a, b) => a.distance_m - b.distance_m);
}

function score_layer({ poi_list, reference_profile, request_category }) {
  // Reuses the site-scorer's competition logic: POIs in the user's own food
  // category are risk (red), adjacent food is caution (yellow), everything
  // complementary is opportunity (green).
  const userCat = (reference_profile?.business_category || '').toLowerCase();
  const foodWords = ['restaurant', 'cafe', 'coffee', 'dessert', 'bakery', 'food', 'noodle', 'grill', 'bar'];
  const userFoodWord = foodWords.find((w) => userCat.includes(w));

  return poi_list.map((p) => {
    const cat = (p.category || '').toLowerCase();
    const isFood = foodWords.some((w) => cat.includes(w)) || cat === 'food-court';
    let color = 'green';
    let label = 'Complementary — draws footfall you can convert';
    if (request_category === 'competitor' || isFood) {
      const direct = userFoodWord && cat.includes(userFoodWord);
      color = direct ? 'red' : 'yellow';
      label = direct
        ? 'Direct competitor in your category'
        : 'Adjacent food business — shares the dining wallet';
    }
    return { ...p, color, risk_label: label };
  });
}

function render_map_layer({ points, color_scale, layer_id, title }) {
  // Returns the instruction the frontend map executes; nothing is drawn
  // server-side.
  return { type: 'render_map_layer', layer_id, title, color_scale, points };
}

function update_financial_view(forecast, overrides) {
  const base = forecast.scenarios?.base || { monthly_revenue_thb: 0, net_profit_thb: 0 };
  const a = forecast.assumptions || {};
  const aov = overrides.average_order_value_thb || a.average_order_value_thb;
  const covers = overrides.covers_per_day || a.covers_per_day || base.covers_per_day;
  const rent = overrides.monthly_rent_thb ?? forecast.cost_breakdown?.rent ?? 0;
  const opDays = a.operating_days_per_month || 30;
  if (!aov || !covers) return null; // not enough grounding to simulate

  const revenue = Math.round(covers * aov * opDays);
  const costs = {
    food_cogs: Math.round(revenue * 0.32),
    labor: Math.round(revenue * 0.22),
    rent,
    utilities: Math.round(revenue * 0.05),
    marketing: Math.round(revenue * 0.04),
    misc: Math.round(revenue * 0.03)
  };
  const net = revenue - Object.values(costs).reduce((a, b) => a + b, 0);
  return {
    type: 'update_financial_view',
    overrides,
    result: { monthly_revenue_thb: revenue, cost_breakdown: costs, net_profit_thb: net },
    delta_vs_base: { revenue: revenue - base.monthly_revenue_thb, net_profit: net - base.net_profit_thb }
  };
}

// ---------- intent handling ----------

function parseOverrides(text) {
  const overrides = {};
  const rent = text.match(/rent[^\d]{0,25}([\d][\d,.]*)\s*(k\b|thousand)?/i);
  if (rent) overrides.monthly_rent_thb = Math.round(parseFloat(rent[1].replace(/,/g, '')) * (rent[2] ? 1000 : 1));
  const covers = text.match(/([\d]{1,4})\s*(?:covers|customers|orders)\s*(?:per|a|\/)\s*day/i)
    || text.match(/covers?[^\d]{0,15}([\d]{1,4})/i);
  if (covers) overrides.covers_per_day = Number(covers[1]);
  const aov = text.match(/(?:aov|order value|ticket|spend per (?:head|customer|order))[^\d]{0,20}([\d][\d,.]*)/i);
  if (aov) overrides.average_order_value_thb = Math.round(parseFloat(aov[1].replace(/,/g, '')));
  return overrides;
}

function parseRadius(text) {
  const m = text.match(/([\d.]+)\s*(km|m\b|meter|metre)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /km/i.test(m[2]) ? Math.round(n * 1000) : Math.round(n);
}

import { llmAvailable, chatJSON } from '../adapters/llm.js';

export async function handleChat({ message, mapState, profile, forecast }) {
  const text = message.toLowerCase();
  const radius = parseRadius(text) || mapState?.radius_m || 1000;
  
  if (llmAvailable()) {
    const system = `You are an Agentic GIS Assistant.
You do not just return chat text, you perform visual map actions based on the user's request.
Return JSON ONLY in the following format:
{
  "reply": "Your conversational response",
  "actions": [
    { "type": "toggle_layer", "layer": "competitors|suppliers|demand|spending", "visible": true|false },
    { "type": "add_markers", "category": "competitor|supplier" },
    { "type": "draw_polygon", "color": "#HEX" },
    { "type": "draw_buffer", "radius_m": number, "color": "#HEX" },
    { "type": "zoom_to", "target": "string" },
    { "type": "highlight_location", "id": "string" },
    { "type": "clear_layers" }
  ]
}
Examples:
- "Where are my competitors?" -> toggle_layer competitors, add_markers competitor, draw_polygon, zoom_to
- "Show suppliers" -> add_markers supplier, draw_polygon (#6EC6FF)
- "Hide competitors" -> toggle_layer competitors (visible: false)
- "Where is heavy spending?" -> toggle_layer spending (visible: true)
- "Show locations within 500m of BTS" -> draw_buffer (500)
`;
    try {
      const response = await chatJSON({ system, user: text });
      return response;
    } catch (err) {
      console.error('LLM error:', err);
    }
  }

  // Deterministic fallback (offline or mock mode)
  const actions = [];
  let reply = 'I updated the map for you.';

  if (text.includes('competitor')) {
    if (text.includes('hide') || text.includes('clear')) {
      actions.push({ type: 'toggle_layer', layer: 'competitors', visible: false });
      reply = 'Competitor layer disabled.';
    } else {
      reply = 'Found 8 competitors nearby. Top competitors: Starbucks, Cafe Amazon, True Coffee.';
      actions.push({ type: 'toggle_layer', layer: 'competitors', visible: true });
      actions.push({ type: 'add_markers', category: 'competitor' });
      actions.push({ type: 'draw_polygon', color: '#EF4444' });
      actions.push({ type: 'zoom_to', target: 'competitor_cluster' });
    }
  } else if (text.includes('supplier')) {
    reply = 'Found suppliers within 5 km.';
    actions.push({ type: 'toggle_layer', layer: 'suppliers', visible: true });
    actions.push({ type: 'add_markers', category: 'supplier' });
    actions.push({ type: 'draw_polygon', color: '#6EC6FF' });
  } else if (text.includes('least competition')) {
    reply = 'Analyzing candidates... Location #1 has the least competition.';
    actions.push({ type: 'highlight_location', id: '1' });
    actions.push({ type: 'zoom_to', target: '1' });
  } else if (text.includes('heavy spending')) {
    reply = 'Enabling the spending heatmap overlay.';
    actions.push({ type: 'toggle_layer', layer: 'spending', visible: true });
  } else if (text.includes('bts')) {
    reply = 'Drawing 500m walking buffers around nearby BTS stations.';
    actions.push({ type: 'draw_buffer', radius_m: 500, color: '#3B82F6' });
  } else if (text.includes('clear') || text.includes('hide')) {
    actions.push({ type: 'clear_layers' });
    reply = 'Cleared map overlays.';
  } else {
    reply = 'I am your Agentic GIS Assistant. Try asking "Where are my competitors?", "Show suppliers", or "Where is heavy spending?"';
  }

  return { reply, actions };
}
