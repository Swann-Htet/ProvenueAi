// Agent 3: Report Generation Agent (AGENTS.md §3, IMPLEMENTATION.md §5).
// Fuses the 18-field profile + candidate properties + the 4 datasets into
// site scores (6 weighted dimensions), a financial simulation, and pricing.
//
// With NIM configured the Assembled Context Payload is sent through the §5.2
// prompt and schema-validated (retry once, then fall back). Without it, the
// deterministic engine below computes the same output contract — every number
// grounded in the supplied context, with data_gap flags instead of guesses.

import { chatJSON, llmAvailable } from '../adapters/llm.js';
import { getFootTraffic, getSpendingRange, getSupplierMap, getNearbyPoi } from '../adapters/sheets.js';
import { haversineM, nearestZone } from '../adapters/geo.js';

export const WEIGHTS = {
  foot_traffic_density: 0.25,
  customer_profile_match: 0.2,
  competition_landscape: 0.2,
  accessibility_visibility: 0.15,
  anchor_attractions: 0.12,
  rental_economics: 0.08
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ---------- context assembly (Data Fusion Layer) ----------

export async function assembleContext(profile, candidates) {
  const zones = new Map();
  for (const p of candidates) {
    const zone = nearestZone(p.lat, p.lng);
    if (!zones.has(zone.zone_id)) {
      zones.set(zone.zone_id, {
        zone_id: zone.zone_id,
        label: zone.label,
        foot_traffic: await getFootTraffic(zone.zone_id),
        spending_range: await getSpendingRange(zone.zone_id),
        supplier_map: await getSupplierMap(zone.zone_id),
        nearby_poi: await getNearbyPoi(zone.zone_id)
      });
    }
  }
  return { user_profile: profile, candidate_properties: candidates, zones: Object.fromEntries(zones) };
}

// ---------- deterministic engine ----------

function scoreProperty(property, zoneData, profile, dataGaps) {
  const d = {};
  const here = { lat: property.lat, lng: property.lng };

  // 1. Foot traffic density (25%) — normalized average hourly pedestrians.
  if (zoneData.foot_traffic) {
    const all = [...zoneData.foot_traffic.weekday_hourly, ...zoneData.foot_traffic.weekend_hourly];
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    d.foot_traffic_density = clamp((avg / 160) * 100);
  } else {
    d.foot_traffic_density = 0;
    dataGaps.add(`foot_traffic missing for zone ${zoneData.zone_id}`);
  }

  // 2. Customer profile match (20%) — income bracket + AOV vs zone spend.
  if (zoneData.spending_range) {
    const bracketMap = { high: 'High', 'upper-mid': 'Mid', mid: 'Mid', budget: 'Budget' };
    const zoneBracket = bracketMap[zoneData.spending_range.bracket] || 'Mid';
    let s = zoneBracket === (profile.target_income_bracket || 'Mid') ? 85 : 60;
    const aov = profile.average_order_value_thb;
    if (aov) {
      const ratio = aov / zoneData.spending_range.avg_spend_per_visit_thb;
      if (ratio > 1.4) s -= 25; // priced above what the zone spends
      else if (ratio > 1.1) s -= 10;
      else if (ratio < 0.5) s -= 5; // leaving money on the table
      else s += 10;
    }
    d.customer_profile_match = clamp(s);
  } else {
    d.customer_profile_match = 0;
    dataGaps.add(`spending_range missing for zone ${zoneData.zone_id}`);
  }

  // 3. Competition landscape (20%) — some competitors validate demand,
  //    saturation hurts.
  const competitors = (zoneData.nearby_poi?.competitors || []).filter(
    (c) => haversineM(here, c) <= 500
  );
  const n = competitors.length;
  d.competition_landscape = clamp(n === 0 ? 70 : n <= 2 ? 88 : n <= 4 ? 72 : n <= 6 ? 55 : 38);

  // 4. Accessibility & visibility (15%) — distance to nearest transit stop.
  const transit = zoneData.nearby_poi?.transit || [];
  if (transit.length) {
    const nearest = Math.min(...transit.map((t) => haversineM(here, t)));
    d.accessibility_visibility = clamp(nearest <= 150 ? 95 : nearest <= 350 ? 82 : nearest <= 600 ? 65 : nearest <= 1000 ? 48 : 30);
  } else {
    d.accessibility_visibility = 40;
    dataGaps.add(`transit POI missing for zone ${zoneData.zone_id}`);
  }

  // 5. Anchor attractions (12%) — malls/parks/offices within 800m.
  const anchors = (zoneData.nearby_poi?.anchors || []).filter((a) => haversineM(here, a) <= 800);
  d.anchor_attractions = clamp(35 + anchors.length * 22);

  // 6. Rental economics (8%) — rent vs stated target.
  if (property.monthly_rent_thb && profile.target_monthly_rent_thb) {
    const ratio = property.monthly_rent_thb / profile.target_monthly_rent_thb;
    d.rental_economics = clamp(ratio <= 0.8 ? 95 : ratio <= 1 ? 85 : ratio <= 1.2 ? 60 : ratio <= 1.5 ? 40 : 20);
  } else if (property.monthly_rent_thb) {
    d.rental_economics = 60;
  } else {
    d.rental_economics = 0;
    dataGaps.add(`monthly_rent missing for property ${property.property_name}`);
  }

  const score = clamp(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + d[k] * w, 0));
  const classification = score >= 75 ? 'GREEN' : score >= 50 ? 'YELLOW' : 'RED';

  const reasoning = buildReasoning(property, d, { competitors: n, anchors: anchors.length, zone: zoneData.label });
  return { property_id: property.id, property_name: property.property_name, score, classification, dimension_breakdown: d, reasoning };
}

function buildReasoning(property, d, ctx) {
  const parts = [];
  parts.push(d.foot_traffic_density >= 70 ? `Strong pedestrian flow in ${ctx.zone}.` : d.foot_traffic_density >= 45 ? `Moderate foot traffic in ${ctx.zone}.` : `Foot traffic in ${ctx.zone} is light for walk-in trade.`);
  parts.push(d.customer_profile_match >= 75 ? 'Zone spending power matches the target customer well.' : 'Target customer profile is only a partial match for this zone.');
  parts.push(ctx.competitors <= 2 ? `${ctx.competitors} direct competitor(s) within 500m — demand validated without saturation.` : `${ctx.competitors} competitors within 500m — differentiation will matter.`);
  parts.push(d.accessibility_visibility >= 80 ? 'Excellent transit access.' : d.accessibility_visibility >= 60 ? 'Reasonable transit access.' : 'Weak transit access; expect car/delivery reliance.');
  if (d.rental_economics <= 40 && property.monthly_rent_thb) parts.push(`Rent of ฿${property.monthly_rent_thb.toLocaleString()} is above the stated budget — economics are the main risk here.`);
  return parts.join(' ');
}

function simulateFinancials(profile, property, zoneData, dataGaps) {
  const aov = profile.average_order_value_thb || zoneData.spending_range?.avg_spend_per_visit_thb || null;
  if (!aov) dataGaps.add('average_order_value missing — used no revenue basis');

  const opDays = (profile.operating_days?.length || 7) * 4.33;
  const rent = property?.monthly_rent_thb || profile.target_monthly_rent_thb || 0;

  // Covers model: capture a small share of daily pedestrian flow, scaled by
  // how central the site is to that flow.
  let coversPerDay = 0;
  if (zoneData.foot_traffic && aov) {
    const daily =
      (zoneData.foot_traffic.weekday_hourly.reduce((a, b) => a + b, 0) * 5 +
        zoneData.foot_traffic.weekend_hourly.reduce((a, b) => a + b, 0) * 2) / 7;
    coversPerDay = Math.round(daily * 0.015); // 1.5% capture rate assumption
  }

  const revenueBase = Math.round(coversPerDay * aov * opDays);
  const revenueRange = [Math.round(revenueBase * 0.85), Math.round(revenueBase * 1.15)];

  // Reality-check on labor (per the deck): naive plans assume ~15% of
  // revenue; realistic Thai SME restaurant labor runs 20–25%.
  const laborNaivePct = 0.15;
  const laborRealPct = 0.22;

  const cost = (rev) => ({
    food_cogs: Math.round(rev * 0.32),
    labor: Math.round(rev * laborRealPct),
    rent,
    utilities: Math.round(rev * 0.05),
    marketing: Math.round(rev * 0.04),
    misc: Math.round(rev * 0.03)
  });

  const net = (rev) => rev - Object.values(cost(rev)).reduce((a, b) => a + b, 0);

  const contributionPerCover = aov ? aov * (1 - 0.32 - 0.05 - 0.04 - 0.03) : 0;
  const fixedMonthly = rent + revenueBase * laborRealPct; // labor treated as committed
  const breakEvenCovers = contributionPerCover > 0 ? Math.ceil(fixedMonthly / contributionPerCover / opDays) : null;

  const investment = profile.total_investment_thb || null;
  const avgNet = (net(revenueRange[0]) + net(revenueRange[1])) / 2;
  const payback = investment && avgNet > 0 ? Math.ceil(investment / avgNet) : null;
  if (!investment) dataGaps.add('total_investment missing — payback period not computed');

  const scenario = (mult) => {
    const rev = Math.round(revenueBase * mult);
    return { monthly_revenue_thb: rev, net_profit_thb: net(rev), covers_per_day: Math.round(coversPerDay * mult) };
  };

  return {
    assumptions: {
      covers_per_day: coversPerDay,
      average_order_value_thb: aov,
      operating_days_per_month: Math.round(opDays),
      capture_rate_pct: 1.5,
      labor_reality_check: {
        naive_pct_of_revenue: laborNaivePct * 100,
        realistic_pct_of_revenue: laborRealPct * 100,
        note: 'Forecast uses the realistic labor line, not the optimistic one.'
      }
    },
    monthly_revenue_range_thb: revenueRange,
    cost_breakdown: cost(revenueBase),
    net_profit_range_thb: [net(revenueRange[0]), net(revenueRange[1])],
    break_even_covers_per_day: breakEvenCovers,
    payback_period_months: payback,
    scenarios: { base: scenario(1), plus_20pct: scenario(1.2), minus_30pct: scenario(0.7) }
  };
}

function recommendPricing(profile, zoneData) {
  const aov = profile.average_order_value_thb || zoneData.spending_range?.avg_spend_per_visit_thb || 300;
  const zoneSpend = zoneData.spending_range?.avg_spend_per_visit_thb || aov;
  // Floor: cover a 32% food-cost basis at a 35% max COGS target.
  const floor = Math.round((aov * 0.32) / 0.35 / 10) * 10;
  const ceiling = Math.round((zoneSpend * 1.15) / 10) * 10;

  const cat = (profile.business_category || '').toLowerCase();
  const menus = {
    cafe: [
      { item: 'Signature espresso drinks', quadrant: 'Star', action: 'Keep price, feature at entry display' },
      { item: 'Basic americano/latte', quadrant: 'Plowhorse', action: 'High volume, thin margin — nudge price +5-8%' },
      { item: 'Specialty single-origin pour-over', quadrant: 'Puzzle', action: 'High margin, low volume — train staff to upsell' },
      { item: 'Bottled juices (bought-in)', quadrant: 'Dog', action: 'Cut or replace with house-made option' }
    ],
    dessert: [
      { item: 'Signature plated dessert', quadrant: 'Star', action: 'Anchor the menu around it' },
      { item: 'Soft-serve / basic scoop', quadrant: 'Plowhorse', action: 'Bundle into sets to lift ticket size' },
      { item: 'Seasonal tasting set', quadrant: 'Puzzle', action: 'Promote on social to grow volume' },
      { item: 'Packaged snacks', quadrant: 'Dog', action: 'Remove from menu' }
    ],
    default: [
      { item: 'Signature mains', quadrant: 'Star', action: 'Protect quality and price; hero of the menu' },
      { item: 'Rice/noodle staples', quadrant: 'Plowhorse', action: 'Popular but low margin — re-engineer portion cost' },
      { item: 'Premium specials', quadrant: 'Puzzle', action: 'High margin, low sales — reposition on menu' },
      { item: 'Low-margin low-volume sides', quadrant: 'Dog', action: 'Cut or fold into set menus' }
    ]
  };
  const matrix = cat.includes('cafe') || cat.includes('coffee') ? menus.cafe : cat.includes('dessert') || cat.includes('bakery') ? menus.dessert : menus.default;

  return { price_floor_thb: floor, price_ceiling_thb: ceiling, menu_matrix: matrix };
}

export function deterministicReport(context) {
  const dataGaps = new Set();
  const { user_profile: profile, candidate_properties: candidates, zones } = context;

  const site_scores = candidates.map((p) => {
    const zone = nearestZone(p.lat, p.lng);
    return scoreProperty(p, zones[zone.zone_id], profile, dataGaps);
  }).sort((a, b) => b.score - a.score);

  const top = site_scores[0];
  const topProperty = candidates.find((c) => c.id === top?.property_id) || candidates[0];
  const topZone = topProperty ? zones[nearestZone(topProperty.lat, topProperty.lng).zone_id] : Object.values(zones)[0];

  const financial_forecast = topProperty ? simulateFinancials(profile, topProperty, topZone, dataGaps) : null;
  const pricing_recommendation = topZone ? recommendPricing(profile, topZone) : null;
  if (!topProperty) dataGaps.add('no candidate properties in the selected area');

  return {
    engine: 'deterministic',
    site_scores,
    financial_forecast,
    pricing_recommendation,
    data_gap: [...dataGaps]
  };
}

// ---------- NIM path with schema validation + single retry ----------

function validateReportShape(out) {
  return out && Array.isArray(out.site_scores) && out.financial_forecast && out.pricing_recommendation;
}

// LLM outputs drift from the schema in small ways ({low,high} instead of
// [min,max], missing assumptions). Coerce to the exact contract the UI and
// the what-if tool consume, so downstream code never branches on shape.
function toRange(v) {
  if (Array.isArray(v) && v.length >= 2) return [Number(v[0]) || 0, Number(v[1]) || 0];
  if (v && typeof v === 'object') {
    const lo = v.low ?? v.min ?? v.lower ?? 0;
    const hi = v.high ?? v.max ?? v.upper ?? lo;
    return [Number(lo) || 0, Number(hi) || 0];
  }
  const n = Number(v) || 0;
  return [n, n];
}

function normalizeReport(context, out) {
  const profile = context.user_profile || {};
  const f = out.financial_forecast || {};
  f.monthly_revenue_range_thb = toRange(f.monthly_revenue_range_thb);
  f.net_profit_range_thb = toRange(f.net_profit_range_thb);
  f.break_even_covers_per_day = Number(f.break_even_covers_per_day) || null;
  f.payback_period_months = Number(f.payback_period_months) || null;
  f.cost_breakdown = f.cost_breakdown || {};

  const scen = f.scenarios || {};
  for (const key of ['base', 'plus_20pct', 'minus_30pct']) {
    const s = scen[key] || {};
    scen[key] = {
      monthly_revenue_thb: Number(s.monthly_revenue_thb ?? s.revenue ?? s.monthly_revenue) || 0,
      net_profit_thb: Number(s.net_profit_thb ?? s.net_profit ?? s.profit) || 0,
      covers_per_day: Number(s.covers_per_day ?? s.covers) || 0
    };
  }
  f.scenarios = scen;

  if (!f.assumptions) {
    const opDays = (profile.operating_days?.length || 7) * 4.33;
    f.assumptions = {
      covers_per_day: scen.base.covers_per_day || null,
      average_order_value_thb: profile.average_order_value_thb || null,
      operating_days_per_month: Math.round(opDays),
      capture_rate_pct: null,
      labor_reality_check: {
        naive_pct_of_revenue: 15,
        realistic_pct_of_revenue: 22,
        note: 'Model instructed to use the realistic labor line, not the optimistic one.'
      }
    };
  }
  out.financial_forecast = f;

  out.site_scores = (out.site_scores || []).map((s) => ({
    ...s,
    score: Math.round(Number(s.score) || 0),
    classification: String(s.classification || '').toUpperCase(),
    dimension_breakdown: Object.fromEntries(
      Object.entries(s.dimension_breakdown || {}).map(([k, v]) => [k, Math.round(Number(v) || 0)])
    )
  }));

  const p = out.pricing_recommendation || {};
  p.price_floor_thb = Number(p.price_floor_thb) || 0;
  p.price_ceiling_thb = Number(p.price_ceiling_thb) || 0;
  p.menu_matrix = Array.isArray(p.menu_matrix) ? p.menu_matrix : [];
  out.pricing_recommendation = p;

  out.data_gap = Array.isArray(out.data_gap) ? out.data_gap : [];
  return out;
}

export async function generateReport(context) {
  if (llmAvailable()) {
    const system =
      "You are ProvenueAI's Site Intelligence & Financial Simulation engine. " +
      'Use ONLY the data provided in CONTEXT. Never invent numbers. If a required field is missing, add it to "data_gap". ' +
      'Return output strictly as JSON with keys: site_scores[] (property_id, score 0-100, classification GREEN|YELLOW|RED, ' +
      'dimension_breakdown {foot_traffic_density, customer_profile_match, competition_landscape, accessibility_visibility, ' +
      'anchor_attractions, rental_economics}, reasoning), financial_forecast (monthly_revenue_range_thb, cost_breakdown, ' +
      'net_profit_range_thb, break_even_covers_per_day, payback_period_months, scenarios {base, plus_20pct, minus_30pct}), ' +
      'pricing_recommendation (price_floor_thb, price_ceiling_thb, menu_matrix[] {item, quadrant Star|Plowhorse|Puzzle|Dog, action}), ' +
      'data_gap[]. Weights: foot traffic 25%, profile match 20%, competition 20%, accessibility 15%, anchors 12%, rental economics 8%. ' +
      'GREEN 75-100, YELLOW 50-74, RED 0-49. Include the labor reality-check (realistic 20-25%, not naive 15%). ' +
      'Keep each reasoning string under 40 words. Respond with the JSON object only — no markdown, no prose.';
    const user = `CONTEXT:\n${JSON.stringify(context, null, 1)}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await chatJSON({ system, user, maxTokens: 3000 });
        if (validateReportShape(out)) return enforceTop3({ engine: 'nvidia-nim', ...normalizeReport(context, out) });
      } catch (err) {
        // A timed-out call will time out again — fall back immediately.
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') break;
      }
    }
    // Schema failure after retry: partial-report fallback with a flag.
    const fallback = deterministicReport(context);
    fallback.data_gap.push('NIM output failed schema validation twice — deterministic fallback used');
    return enforceTop3(fallback);
  }
  return enforceTop3(deterministicReport(context));
}

function enforceTop3(report) {
  if (report && Array.isArray(report.site_scores)) {
    report.site_scores.sort((a, b) => (b.score || 0) - (a.score || 0));
    report.site_scores = report.site_scores.map((s, idx) => {
      let classification = String(s.classification || '').toUpperCase();
      if (idx < 3) {
        classification = 'GREEN';
      } else if (classification === 'GREEN') {
        classification = 'YELLOW';
      }
      return { ...s, classification };
    });
  }
  return report;
}
