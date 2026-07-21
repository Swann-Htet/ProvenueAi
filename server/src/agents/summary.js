// Intake Summary agent: after the 18-field wizard is filled, produce a short
// natural-language recap of what the user told us (NVIDIA NIM when
// configured, a deterministic recap otherwise) so the final review step
// reads like a person confirming the details back — not a raw data dump.
//
// Guardrail: the model is only allowed to restate facts already present in
// the profile JSON — never invent numbers or details that weren't provided.

import { chatJSON, llmAvailable } from '../adapters/llm.js';

export async function generateProfileSummary(profile) {
  if (llmAvailable()) {
    try {
      const out = await chatJSON({
        system:
          "You are ProvenueAI's intake assistant. You'll receive a partially or fully filled restaurant " +
          'business-profile JSON (up to 18 fields). Write a warm, professional 3-5 sentence executive summary that ' +
          'restates back what the founder told us — project name, category, location, investment, rent, target ' +
          'customers, goals — in plain language, as if confirming understanding before moving on. ' +
          'Use ONLY facts present in the JSON. Never invent a number, name, or detail that is missing or null — ' +
          'simply omit it. Return STRICT JSON: {"summary": "..."}.',
        user: JSON.stringify(profile),
        maxTokens: 400
      });
      if (out?.summary && typeof out.summary === 'string') {
        return { summary: out.summary.trim(), engine: 'nvidia-nim' };
      }
    } catch {
      // fall through to the deterministic recap
    }
  }
  return { summary: deterministicSummary(profile), engine: 'deterministic' };
}

function deterministicSummary(p) {
  const parts = [];
  const name = p.project_name || 'This project';
  const cat = p.business_category ? ` (${p.business_category})` : '';
  parts.push(`${name}${cat} is being planned`);
  if (p.location?.label) parts.push(`for ${p.location.label}`);
  if (p.total_investment_thb) parts.push(`with a total investment of ฿${Number(p.total_investment_thb).toLocaleString()}`);
  let sentence = parts.join(' ') + '.';

  const extras = [];
  if (p.target_monthly_rent_thb) extras.push(`targeting ฿${Number(p.target_monthly_rent_thb).toLocaleString()}/month rent`);
  if (p.required_space_sqm?.filter(Boolean).length) extras.push(`${p.required_space_sqm.filter(Boolean).join('–')} sqm of space`);
  if (p.average_order_value_thb) extras.push(`an average order of ฿${p.average_order_value_thb}`);
  if (extras.length) sentence += ` It's ${extras.join(', ')}.`;

  const audience = [];
  if (p.customer_segments?.length) audience.push(p.customer_segments.join(', ').toLowerCase());
  if (p.target_income_bracket) audience.push(`${p.target_income_bracket.toLowerCase()}-income`);
  if (audience.length) sentence += ` The concept is aimed at ${audience.join(', ')} customers.`;

  if (p.primary_objective) sentence += ` The primary goal is ${p.primary_objective.toLowerCase()}${p.expected_roi_target_pct ? `, with a target ROI of ${p.expected_roi_target_pct}%/year` : ''}.`;

  return sentence;
}
