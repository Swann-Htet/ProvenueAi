// NVIDIA NIM adapter (OpenAI-compatible chat completions). When NIM_API_KEY
// is set, agents route their prompts here; otherwise each agent falls back to
// its deterministic engine so the whole app runs offline.
//
//   NIM_API_KEY   — API key (integrate.api.nvidia.com or self-hosted NIM)
//   NIM_BASE_URL  — default https://integrate.api.nvidia.com/v1
//   NIM_MODEL     — default meta/llama-3.1-70b-instruct

const API_KEY = process.env.NIM_API_KEY;
const BASE_URL = process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const MODEL = process.env.NIM_MODEL || 'meta/llama-3.1-70b-instruct';
const TIMEOUT_MS = Number(process.env.NIM_TIMEOUT_MS || 120000);

export const llmAvailable = () => Boolean(API_KEY);

export async function chatJSON({ system, user, maxTokens = 4096 }) {
  if (!API_KEY) return null;
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      max_tokens: maxTokens
    })
  });
  if (!res.ok) throw new Error(`NIM endpoint error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || '';
  // Models sometimes wrap JSON in markdown fences — strip before parsing.
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}
