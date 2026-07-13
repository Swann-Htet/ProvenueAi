# AGENTS.md — ProvenueAI Agent Specifications

This file specifies every AI agent in the ProvenueAI system: what it does, what it's triggered by, what tools/data it can access, its prompt shape, its output contract, and its guardrails. Pair this with `IMPLEMENTATION.md` for the surrounding architecture and flow diagrams.

---

## Agent Index

| # | Agent | Side | Role |
|---|---|---|---|
| 1 | Property Sourcing Agent | Admin | Search + scrape + structure candidate property listings |
| 2 | Voice Interview Agent | User | Turn spoken business description into the 18-field profile |
| 3 | Report Generation Agent | System | Fuse user + property + external data → site score, financials, pricing (NVIDIA NIM) |
| 4 | Post-Report Insight Agent | User | Answer follow-up questions and re-render the map with live overlays |

---

## Agent 1: Property Sourcing Agent (Admin)

**Purpose:** Given an area typed by the admin, find candidate vacant/available properties from public listing sources and return a structured, admin-reviewable table (never auto-publishes).

**Trigger:** Admin submits a search (area + optional filters: size, budget, property type).

**Inputs**
```json
{
  "area": "Thonglor, Bangkok",
  "size_sqm_min": 80,
  "size_sqm_max": 150,
  "budget_rent_max_thb": 150000,
  "property_type": ["shophouse", "mall_unit", "standalone"]
}
```

**Tools available**
- `web_search(query)` — find candidate listing pages (DDproperty, Google-indexed listings, etc.)
- `web_fetch(url)` — pull the raw page content of a candidate listing
- `extract_listing_fields(raw_text)` — LLM-based structured extraction into the property schema
- `geocode(address)` — resolve address to lat/lng (Nominatim, free)

**Process**
1. Build 2–4 targeted search queries from the area + filters.
2. For each promising result, fetch the page and run `extract_listing_fields`.
3. Deduplicate by address/phone; discard listings missing rent AND size (unusable).
4. Attach a `scrape_confidence` score (0–1) based on how many required fields were extracted with high certainty.
5. Return all rows — do **not** write to the Property DB. Only the admin's confirm action writes to DB.

**Output contract**
```json
{
  "results": [
    {
      "property_name": "string",
      "address": "string",
      "lat": 0.0, "lng": 0.0,
      "monthly_rent_thb": 0,
      "size_sqm": 0,
      "property_type": "shophouse",
      "owner_contact": "string|null",
      "source_url": "string",
      "scrape_confidence": 0.0
    }
  ]
}
```

**Guardrails**
- Only fetch publicly accessible pages; respect `robots.txt`; never attempt to bypass login walls or CAPTCHAs.
- Never fabricate a phone number, rent, or address if extraction is uncertain — return `null` and a low confidence score instead of guessing.
- Always retain `source_url` for traceability and admin verification.
- No auto-publish. Every row requires human confirmation before it enters the live Property DB.

---

## Agent 2: Voice Interview Agent (User)

**Purpose:** Conduct a natural conversational interview (from an STT transcript stream) that incrementally fills the 18-field business profile, asking follow-up questions only for missing or low-confidence fields.

**Trigger:** User selects "Talk instead of typing" during onboarding.

**Inputs**
- Running transcript (STT output, streamed or chunked)
- Current form state (which of the 18 fields are already filled, and with what confidence)

**Tools available**
- `extract_fields(transcript_chunk, current_state)` — LLM call that maps free text to the 18-field schema
- `ask_followup(missing_fields[])` — generates the next spoken/text question, prioritized by which fields most affect the report (Location, Budget, Business Category first)

**The 18-field target schema**
```json
{
  "project_name": "string",
  "business_category": "string",
  "executive_summary": "string",
  "total_investment_thb": 0,
  "target_monthly_rent_thb": 0,
  "required_space_sqm": [0, 0],
  "supporting_documents": ["file_id"],
  "business_type": "string",
  "concept_description": "string",
  "operating_model": "string",
  "customer_segments": ["string"],
  "target_income_bracket": "string",
  "primary_objective": "string",
  "expected_roi_target_pct": 0,
  "operating_days": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  "average_order_value_thb": 0,
  "est_setup_cost_thb": 0,
  "location": {"lat": 0.0, "lng": 0.0, "label": "string"}
}
```

**Process**
1. On each transcript chunk, call `extract_fields`, which returns `{field, value, confidence}` for anything it detected.
2. Only auto-fill fields with confidence ≥ a set threshold (e.g. 0.75). Below that, leave blank.
3. After each turn, compute `missing_or_low_confidence = required_fields - confidently_filled_fields`.
4. If any remain, call `ask_followup` to generate the next single question (one question at a time — don't overwhelm the user).
5. When all required fields (marked `*`, plus enough optional fields for a usable report) are filled, present the **full form for user review and manual edit** before submission.

**Output contract:** the same 18-field JSON above, plus a `field_confidence` map and `source: "voice_interview"`.

**Guardrails**
- Never submit the form without explicit user confirmation on the review screen.
- Never infer sensitive personal data beyond what's needed for the 18 fields.
- If the user's answer is ambiguous (e.g. gives a budget range instead of a number), ask a clarifying follow-up rather than picking an assumed value silently.
- Keep follow-up questions to one at a time, in plain conversational language, not form-field jargon.

---

## Agent 3: Report Generation Agent (NVIDIA NIM)

**Purpose:** Fuse the user's business profile with property candidates and the 4 external datasets into a Site Intelligence + Financial Simulation + Pricing report.

**Trigger:** User submits the confirmed 18-field profile (and selects a search radius/preferred area).

**Inputs (Assembled Context Payload)**
```json
{
  "user_profile": { "...18 fields..." },
  "candidate_properties": [ "...Property DB rows within radius/preferred area..." ],
  "foot_traffic": { "zone_id": "...", "hourly": [...] },
  "spending_range": { "zone_id": "...", "avg_income": 0, "avg_spend": 0 },
  "supplier_map": [ { "name": "...", "distance_m": 0, "category": "..." } ],
  "nearby_poi": { "competitors": [...], "transit": [...], "anchors": [...] }
}
```

**Model:** NVIDIA NIM-hosted LLM endpoint (self-hosted or NVIDIA-managed inference microservice).

**Prompt skeleton** (see `IMPLEMENTATION.md` §5.2 for the full version):
- System role: "site intelligence & financial simulation engine, use only provided context, never invent numbers, return strict JSON"
- Context block: the Assembled Context Payload above
- Task block: (1) score each candidate on the 6 weighted dimensions, (2) run the financial forecaster, (3) recommend pricing

**Output contract**
```json
{
  "site_scores": [
    {
      "property_id": "string",
      "score": 0,
      "classification": "GREEN|YELLOW|RED",
      "dimension_breakdown": {
        "foot_traffic_density": 0,
        "customer_profile_match": 0,
        "competition_landscape": 0,
        "accessibility_visibility": 0,
        "anchor_attractions": 0,
        "rental_economics": 0
      },
      "reasoning": "string"
    }
  ],
  "financial_forecast": {
    "monthly_revenue_range_thb": [0, 0],
    "cost_breakdown": { "food_cogs": 0, "labor": 0, "rent": 0, "utilities": 0, "marketing": 0, "misc": 0 },
    "net_profit_range_thb": [0, 0],
    "break_even_covers_per_day": 0,
    "payback_period_months": 0,
    "scenarios": { "base": {}, "plus_20pct": {}, "minus_30pct": {} }
  },
  "pricing_recommendation": {
    "price_floor_thb": 0,
    "price_ceiling_thb": 0,
    "menu_matrix": [
      { "item": "string", "quadrant": "Star|Plowhorse|Puzzle|Dog", "action": "string" }
    ]
  }
}
```

**Guardrails**
- Model must ground every number in the supplied context — no fabricated statistics. If a required data field is missing, the output must flag it (`"data_gap": ["foot_traffic missing for zone X"]`) rather than silently estimating.
- Always surface the **reality-check step** for labor (as shown in the deck: naive margin vs. realistic margin) rather than only the optimistic case.
- Output must validate against the JSON schema before being shown to the user; on schema failure, retry once, then fall back to a partial-report + error message.

---

## Agent 4: Post-Report Insight Agent (Map Q&A)

**Purpose:** Let the user ask natural-language follow-up questions after the report is generated, and have the map/dashboard update live in response — not just return text.

**Trigger:** User sends a message in the report's chat panel (e.g. "I want to see nearby retail shops").

**Inputs**
- User message (free text)
- Current map/session state: `{ center, radius, active_layers, selected_property_id }`
- Access to the same fused data layers used in Agent 3 (foot traffic, spending, supplier, POI)

**Tools available (function calling)**

```json
[
  {
    "name": "get_nearby_poi",
    "description": "Fetch nearby points of interest of a given category around a coordinate",
    "parameters": {
      "category": "retail | competitor | transit | supplier | school | hospital",
      "center": {"lat": 0.0, "lng": 0.0},
      "radius_m": 500
    }
  },
  {
    "name": "score_layer",
    "description": "Compute a red/yellow/green risk-opportunity color per POI using the same weighted scoring as the site scorer",
    "parameters": { "poi_list": [], "reference_profile": {} }
  },
  {
    "name": "render_map_layer",
    "description": "Push a colored layer to the frontend map component",
    "parameters": { "points": [], "color_scale": "risk|density|spending" }
  },
  {
    "name": "update_financial_view",
    "description": "Re-run a financial scenario with a modified assumption (e.g. different rent, different covers/day)",
    "parameters": { "overrides": {} }
  }
]
```

**Process**
1. Classify the user's intent (map layer request, data question, "what-if" financial question, or general clarification).
2. If it's a map layer request → call `get_nearby_poi` → `score_layer` → `render_map_layer`, then send a short text summary ("Found 12 retail shops within 500m; 3 are high-competition food retailers shown in red.").
3. If it's a "what-if" question → call `update_financial_view` with the overrides and summarize the delta.
4. If ambiguous, ask one clarifying question rather than guessing map parameters (e.g. "Which radius should I use — 300m or 500m?").

**Example turn**
```
User: "I want to see nearby retail shops"
Agent (tool calls): get_nearby_poi(category="retail", center=<selected property>, radius_m=500)
                     -> score_layer(poi_list, reference_profile=user_profile)
                     -> render_map_layer(points, color_scale="risk")
Agent (reply): "Showing 12 retail shops within 500m. 3 are marked red
                (direct competitors in your category), 9 are green
                (complementary businesses, e.g. clothing, salons)."
```

**Guardrails**
- Never render a layer using data the agent doesn't actually have (no hallucinated POIs) — always ground `render_map_layer` calls in a real `get_nearby_poi` tool result.
- Keep map state changes reversible/visible — always tell the user in text what changed on the map, since not all users will notice a visual-only update.
- Cap tool-calling chains per turn (e.g. max 3 tool calls) to keep responses fast and predictable.

---

## Shared Conventions

- **Confidence scoring:** every extraction agent (1 and 2) must attach a confidence value to structured outputs so downstream logic can decide whether to trust it or ask a human.
- **No silent fabrication:** all four agents must prefer `null` / a clarifying question / a flagged data gap over inventing a plausible-sounding number.
- **JSON-only outputs** for machine-consumed responses; conversational text is generated separately, after the structured tool/report result, not interleaved into the JSON.
- **Traceability:** every fact shown to a user (property listing, score, financial figure) should be traceable back to its source dataset for auditability.
