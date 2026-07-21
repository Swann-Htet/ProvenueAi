// Agent 2: Voice Interview Agent (AGENTS.md §2).
// Receives STT transcript chunks + current form state, extracts fields with
// confidence scores, and asks one follow-up at a time for what's missing.
// Fields are auto-filled only at confidence >= 0.75; the client always shows
// the review screen before submission (guardrail: never auto-submit).
//
// With NIM configured, extraction goes through the LLM; the keyword engine
// below is the offline fallback and the ask_followup logic is shared.

import { chatJSON, llmAvailable } from '../adapters/llm.js';
import { matchZoneByName } from '../seed/zones.js';

export const CONFIDENCE_THRESHOLD = 0.75;
export const REQUIRED_FIELDS = ['project_name', 'business_category', 'location'];

// Follow-up priority: fields that most affect the report first
// (Location, Budget, Business Category per AGENTS.md), then the rest.
const FOLLOWUP_ORDER = [
  'location',
  'total_investment_thb',
  'business_category',
  'project_name',
  'target_monthly_rent_thb',
  'required_space_sqm',
  'average_order_value_thb',
  'business_type',
  'operating_model',
  'customer_segments',
  'target_income_bracket',
  'operating_days',
  'expected_roi_target_pct',
  'est_setup_cost_thb',
  'primary_objective',
  'concept_description',
  'executive_summary'
];

const QUESTIONS = {
  location: 'Which area of Bangkok are you looking at? For example Thonglor, Ekkamai, Ari, Silom, or Phrom Phong.',
  total_investment_thb: 'Roughly how much total capital are you planning to invest — a single number in baht works best.',
  business_category: 'What kind of food business is it — a cafe, a full restaurant, a dessert shop, something else?',
  project_name: 'What would you like to call the project? A working name is fine.',
  target_monthly_rent_thb: 'What monthly rent are you comfortable paying, in baht?',
  required_space_sqm: 'How much space do you need? A range in square meters is fine, like 80 to 120.',
  average_order_value_thb: 'When a customer visits, roughly how much do you expect them to spend per order, in baht?',
  business_type: 'Is this a brand-new business, an expansion of an existing one, or a franchise?',
  operating_model: 'Will it be mainly dine-in, takeaway, delivery, or a mix?',
  customer_segments: 'Who are your main customers — office workers, students, families, tourists, expats?',
  target_income_bracket: 'Are you targeting premium spenders, mid-range, or budget-conscious customers?',
  operating_days: 'Which days will you open? Every day, weekdays only, or something else?',
  expected_roi_target_pct: 'Do you have a return-on-investment target in mind, as a percentage per year?',
  est_setup_cost_thb: 'How much do you expect fit-out and setup to cost, in baht?',
  primary_objective: 'What matters most to you right now — steady profit, fast growth, or building the brand?',
  concept_description: 'Tell me a bit about the concept — the vibe, the menu direction, what makes it different.',
  executive_summary: 'In one or two sentences, how would you pitch this business to an investor?'
};

// ---------- extract_fields ----------

export async function extractFields(transcript, currentState = {}) {
  if (llmAvailable()) {
    try {
      const out = await chatJSON({
        system:
          'You extract structured fields from a restaurant founder interview transcript. ' +
          'Return strict JSON: {"extracted":[{"field":string,"value":any,"confidence":number}]}. ' +
          'Fields: project_name, business_category, executive_summary, total_investment_thb, ' +
          'target_monthly_rent_thb, required_space_sqm ([min,max]), business_type, concept_description, ' +
          'operating_model, customer_segments (string[]), target_income_bracket, primary_objective, ' +
          'expected_roi_target_pct, operating_days (["Mon".."Sun"]), average_order_value_thb, ' +
          'est_setup_cost_thb, location ({label}). Never guess: omit anything not clearly stated.',
        user: `Current state: ${JSON.stringify(currentState)}\nTranscript chunk: ${transcript}`
      });
      if (out?.extracted) return out.extracted;
    } catch {
      // fall back to keyword extraction below
    }
  }
  return keywordExtract(transcript);
}

function parseThb(str) {
  // "2 million", "1.5m", "150k", "150,000 baht", "2 ล้าน"
  const m = String(str).match(/([\d][\d,.]*)\s*(million|m\b|ล้าน|k\b|thousand|แสน)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'million' || unit === 'm' || unit === 'ล้าน') n *= 1_000_000;
  else if (unit === 'k' || unit === 'thousand') n *= 1_000;
  else if (unit === 'แสน') n *= 100_000;
  return Math.round(n);
}

function keywordExtract(transcript) {
  const t = transcript.toLowerCase();
  const out = [];
  const add = (field, value, confidence) => value != null && out.push({ field, value, confidence });

  // location — zone alias match
  const zone = matchZoneByName(t);
  if (zone) add('location', { lat: zone.center.lat, lng: zone.center.lng, label: zone.label }, 0.9);

  // project name — "call it X" / "named X" / "name is X"
  const name = transcript.match(/(?:call(?:ed|ing)?|named)\s+(?:it\s+|the\s+(?:place|shop|cafe|restaurant)\s+)?["“']?([\w][\w\s&'-]{1,40}?)["”']?(?:\s+in\s|[,.!?]|$)/i)
    || transcript.match(/name\s+(?:is|it)\s+["“']?([\w][\w\s&'-]{1,40}?)["”']?(?:\s+in\s|[,.!?]|$)/i);
  if (name) add('project_name', name[1].trim(), 0.85);

  // business category
  const categories = [
    ['specialty coffee', 'Specialty Cafe'], ['coffee shop', 'Cafe'], ['cafe', 'Cafe'], ['café', 'Cafe'],
    ['bakery', 'Bakery'], ['dessert', 'Dessert Shop'], ['ice cream', 'Dessert Shop'],
    ['noodle', 'Noodle Restaurant'], ['ramen', 'Japanese Restaurant'], ['sushi', 'Japanese Restaurant'],
    ['izakaya', 'Japanese Restaurant'], ['thai food', 'Thai Restaurant'], ['thai restaurant', 'Thai Restaurant'],
    ['bbq', 'Grill & BBQ'], ['grill', 'Grill & BBQ'], ['bar', 'Bar & Bistro'], ['bistro', 'Bar & Bistro'],
    ['restaurant', 'Restaurant'], ['food truck', 'Food Truck'], ['kiosk', 'Kiosk']
  ];
  for (const [kw, label] of categories) {
    if (t.includes(kw)) { add('business_category', label, 0.8); break; }
  }

  // money fields, keyed by nearby wording
  const invest = t.match(/(?:invest(?:ment)?|budget|capital)[^\d]{0,25}([\d][\d,.]*\s*(?:million|m\b|k\b|thousand|ล้าน|แสน)?)/i);
  if (invest) add('total_investment_thb', parseThb(invest[1]), 0.8);

  const rent = t.match(/rent[^\d]{0,30}([\d][\d,.]*\s*(?:million|m\b|k\b|thousand|ล้าน|แสน)?)/i);
  if (rent) add('target_monthly_rent_thb', parseThb(rent[1]), 0.8);

  const setup = t.match(/(?:setup|fit-?out|renovat\w*)[^\d]{0,30}([\d][\d,.]*\s*(?:million|m\b|k\b|thousand|ล้าน|แสน)?)/i);
  if (setup) add('est_setup_cost_thb', parseThb(setup[1]), 0.78);

  const aov =
    t.match(/(?:average (?:order|spend|ticket)|aov)[^\d]{0,30}([\d][\d,.]*)/i) ||
    t.match(/([\d][\d,.]*)\s*(?:baht|thb|฿)?\s*(?:per|an?)\s*(?:order|customer|head|person|visit)/i);
  if (aov) add('average_order_value_thb', parseThb(aov[1]), 0.8);

  // space range "80 to 120 sqm" / "about 100 sqm"
  const range = t.match(/([\d]{2,4})\s*(?:to|-|–)\s*([\d]{2,4})\s*(?:sqm|sq\.?\s*m|square met)/i);
  if (range) add('required_space_sqm', [Number(range[1]), Number(range[2])], 0.85);
  else {
    const single = t.match(/(?:about|around|roughly)?\s*([\d]{2,4})\s*(?:sqm|sq\.?\s*m|square met)/i);
    if (single) {
      const n = Number(single[1]);
      add('required_space_sqm', [Math.round(n * 0.8), Math.round(n * 1.2)], 0.7);
    }
  }

  // ROI "%"
  const roi = t.match(/(?:roi|return)[^\d]{0,25}([\d]{1,3})\s*(?:%|percent)/i);
  if (roi) add('expected_roi_target_pct', Number(roi[1]), 0.8);

  // operating model / type
  if (/dine[- ]?in/.test(t) && /(delivery|takeaway|take-away)/.test(t)) add('operating_model', 'Dine-in + Delivery', 0.8);
  else if (/dine[- ]?in/.test(t)) add('operating_model', 'Dine-in', 0.8);
  else if (/delivery(-| )?(only|first)/.test(t) || /cloud kitchen/.test(t)) add('operating_model', 'Delivery-first', 0.8);
  else if (/takeaway|take-away|grab[- ]and[- ]go/.test(t)) add('operating_model', 'Takeaway', 0.78);

  if (/franchise/.test(t)) add('business_type', 'Franchise', 0.8);
  else if (/(second|another|expand\w*) (branch|location|store)/.test(t)) add('business_type', 'Expansion', 0.8);
  else if (/(first|new) (business|venture|restaurant|cafe|shop)/.test(t) || /starting (up|out|from scratch)/.test(t)) add('business_type', 'New Business', 0.78);

  // customer segments
  const segs = [];
  if (/office worker|working professional|salar/i.test(t)) segs.push('Office workers');
  if (/student/.test(t)) segs.push('Students');
  if (/tourist/.test(t)) segs.push('Tourists');
  if (/famil/.test(t)) segs.push('Families');
  if (/expat/.test(t)) segs.push('Expats');
  if (/digital nomad|freelancer/.test(t)) segs.push('Digital nomads');
  if (segs.length) add('customer_segments', segs, 0.8);

  // income bracket
  // "budget of 2 million" must NOT read as a budget-tier customer target —
  // only match bracket words used to describe customers.
  if (/premium|high[- ]end|upscale|luxur/.test(t)) add('target_income_bracket', 'High', 0.8);
  else if (/budget[- ](?:conscious|friendly|customer|diner|crowd)|affordab|cheap eats|value[- ]for[- ]money/.test(t)) add('target_income_bracket', 'Budget', 0.78);
  else if (/mid[- ]?range|middle[- ](?:class|income)/.test(t)) add('target_income_bracket', 'Mid', 0.8);

  // objective
  if (/profit/.test(t)) add('primary_objective', 'Profitability', 0.75);
  else if (/grow|scale|expand/.test(t)) add('primary_objective', 'Growth', 0.75);
  else if (/brand/.test(t)) add('primary_objective', 'Brand building', 0.75);

  // operating days
  const ALL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (/every ?day|7 days|daily|all week/.test(t)) add('operating_days', ALL, 0.85);
  else if (/weekday/.test(t)) add('operating_days', ALL.slice(0, 5), 0.85);
  else if (/weekend/.test(t) && /only/.test(t)) add('operating_days', ['Sat', 'Sun'], 0.85);
  else {
    const closed = t.match(/closed (?:on )?(mon|tues?|wed(?:nes)?|thurs?|fri|satur?|sun)/i);
    if (closed) {
      const day = ALL.find((d) => closed[1].toLowerCase().startsWith(d.toLowerCase().slice(0, 3)));
      if (day) add('operating_days', ALL.filter((d) => d !== day), 0.8);
    }
  }

  // long free text -> concept description (low confidence; user reviews anyway)
  if (transcript.split(/\s+/).length > 25) {
    add('concept_description', transcript.trim(), 0.6);
  }

  return out;
}

// ---------- ask_followup ----------

export function nextFollowup(state, askedFields = []) {
  const filled = new Set(
    Object.entries(state)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k]) => k)
  );
  const missing = FOLLOWUP_ORDER.filter((f) => !filled.has(f));
  const requiredMissing = REQUIRED_FIELDS.filter((f) => !filled.has(f));

  // Done when all required fields are in and we have enough optional
  // substance for a usable report (at least 10 of the 18 filled).
  const done = requiredMissing.length === 0 && filled.size >= 10;
  if (done) return { done: true, question: null, missing };

  // One question at a time; skip questions already asked this session so the
  // agent doesn't loop on a field the user declined to answer.
  const nextField = missing.find((f) => !askedFields.includes(f)) || missing[0];
  return { done: false, field: nextField, question: QUESTIONS[nextField], missing };
}
