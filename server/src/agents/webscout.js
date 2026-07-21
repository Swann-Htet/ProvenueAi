// Web Scout agent (admin): given a target website, an area, a row budget,
// and a description of the data wanted (e.g. "phone numbers"), it searches
// the public web for matching pages on that site, fetches them, and extracts
// structured rows — streaming every step to the admin's agent window.
//
// Pipeline: web_search (Bing/DDG HTML) -> robots check -> web_fetch(page)
// -> extract (NIM LLM when configured, regex fallback otherwise).
// Guardrails: public pages only, snippet-only mode when robots.txt
// disallows crawling, no fabricated values, source_url kept per row.

import { chatJSON, llmAvailable } from '../adapters/llm.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12000;

// Optional reliable search backend. Serper.dev returns Google results as JSON
// (free tier ~2,500 queries). When SERPER_API_KEY is set, discovery is solid;
// otherwise we fall back to best-effort HTML scraping of public engines,
// which commercial anti-bot systems increasingly block.
const SERPER_KEY = process.env.SERPER_API_KEY;

async function searchSerper(query, root) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 20 }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`serper ${res.status}`);
  const json = await res.json();
  return (json.organic || [])
    .map((r) => ({ url: r.link, title: r.title || '', snippet: r.snippet || '' }))
    .filter((r) => { try { return new URL(r.url).hostname.includes(root); } catch { return false; } });
}

async function get(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en,th;q=0.8',
      Accept: 'text/html,application/xhtml+xml,*/*',
      ...(opts.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: opts.body,
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const text = await res.text();
  return { status: res.status, text };
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// ---------- web_search ----------

// Unwrap the redirect wrappers search engines put around result links.
function unwrapUrl(raw) {
  let url = decodeEntities(raw);
  const bing = url.match(/[?&]u=a1([^&]+)/); // bing.com/ck/a?...&u=a1<base64url>
  if (bing) {
    try { return Buffer.from(bing[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { /* keep */ }
  }
  const uddg = url.match(/[?&]uddg=([^&]+)/); // duckduckgo redirect
  if (uddg) { try { return decodeURIComponent(uddg[1]); } catch { /* keep */ } }
  if (url.startsWith('//')) url = 'https:' + url;
  return url;
}

// Robust, markup-independent extraction: pull every anchor from a results
// page, keep the ones pointing at the target domain, and use the anchor text
// (plus a little following text) as title/snippet. Survives engine redesigns.
function cleanTitle(s) {
  return s
    .replace(/https?:\/\/\S+/g, ' ')   // strip echoed URLs
    .replace(/\s›\s.*$/, '')            // strip breadcrumb tail
    .replace(/\s+/g, ' ')
    .trim();
}

function harvestLinks(html, root) {
  const byUrl = new Map();
  const re = /<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,300})/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = unwrapUrl(m[1]).split('#')[0];
    let host;
    try { host = new URL(url).hostname; } catch { continue; }
    if (!host.includes(root)) continue;
    if (/\.(css|js|png|jpe?g|svg|ico|woff2?)($|\?)/i.test(url)) continue;
    const raw = stripHtml(m[2]);
    if (/›/.test(raw) || /^https?:/i.test(raw)) continue; // breadcrumb/cite anchor
    const title = cleanTitle(raw);
    if (title.length < 6) continue;
    const snippet = stripHtml(m[3]).slice(0, 400);
    // Keep the entry with the richest title/snippet per URL.
    const prev = byUrl.get(url);
    if (!prev || title.length + snippet.length > prev.title.length + prev.snippet.length) {
      byUrl.set(url, { url, title: title.slice(0, 160), snippet });
    }
  }
  return [...byUrl.values()];
}

async function searchBing(query, root) {
  const { status, text } = await get(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=30&setlang=en`);
  return status === 200 ? harvestLinks(text, root) : [];
}

async function searchDdgLite(query, root) {
  // The Lite endpoint is form-POST based and far more scraper-tolerant.
  const { status, text } = await get('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    body: `q=${encodeURIComponent(query)}&kl=th-en`
  });
  return status === 200 ? harvestLinks(text, root) : [];
}

// ---------- robots ----------

async function robotsAllowsCrawl(domain) {
  try {
    const { status, text } = await get(`https://${domain}/robots.txt`);
    if (status !== 200) return true;
    // Minimal check: a blanket "Disallow: /" under User-agent: *
    const starBlock = text.split(/user-agent:\s*/i).find((b) => b.trim().startsWith('*'));
    if (starBlock && /disallow:\s*\/\s*$/im.test(starBlock)) return false;
    return true;
  } catch {
    return true;
  }
}

// ---------- extraction ----------

const PHONE_RE = /(?:\+66|0)\d{1,2}[-\s.]?\d{3}[-\s.]?\d{3,4}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PRICE_RE = /(?:฿|THB|บาท)\s?[\d][\d,]{2,}|[\d][\d,]{2,}\s?(?:฿|THB|บาท|baht)/gi;

function regexExtract({ title, text, target, url }) {
  const row = { title: title || '(untitled page)', source_url: url };
  const phones = [...new Set(text.match(PHONE_RE) || [])].slice(0, 4);
  const emails = [...new Set(text.match(EMAIL_RE) || [])].slice(0, 3);
  const prices = [...new Set(text.match(PRICE_RE) || [])].slice(0, 3);
  const t = target.toLowerCase();
  // The admin's requested field always gets a column (blank if not on the page).
  if (/ph|phone|contact|tel|num/.test(t)) row.phone = phones.join(', ') || null;
  if (/mail/.test(t)) row.email = emails.join(', ') || null;
  if (/price|rent|cost|฿|baht/.test(t)) row.price = prices.join(', ') || null;
  // Plus any other useful values found incidentally.
  if (!('phone' in row) && phones.length) row.phone = phones.join(', ');
  if (!('email' in row) && emails.length) row.email = emails.join(', ');
  if (!('price' in row) && prices.length) row.price = prices.join(', ');
  // Emit a row for every relevant listing found — honest about blank fields
  // (a bot-protected detail page may hide the phone behind a login).
  return title ? [row] : [];
}

async function llmExtract({ title, text, target, area, url }) {
  const out = await chatJSON({
    system:
      'You extract structured data from web page text for an admin research table. ' +
      'Return STRICT JSON only: {"rows":[{...}]} — up to 3 rows. Each row MUST include "title" and, when present in the text, ' +
      'the admin\'s requested data plus useful context fields (address, price, phone, email). ' +
      'Use short snake_case keys. NEVER invent values: omit a key if the value is not clearly in the text. ' +
      'If nothing relevant is found return {"rows":[]}.',
    user: `REQUESTED DATA: ${target}\nAREA OF INTEREST: ${area}\nPAGE TITLE: ${title}\nURL: ${url}\nPAGE TEXT:\n${text.slice(0, 7000)}`,
    maxTokens: 800
  });
  const rows = Array.isArray(out?.rows) ? out.rows : [];
  return rows
    .filter((r) => r && typeof r === 'object' && Object.keys(r).length > 1)
    .map((r) => ({ title: r.title || title || '(untitled)', ...r, source_url: url }));
}

// ---------- the agent ----------

export async function runWebScout({ website, area, max_rows = 5, target_data = 'phone numbers' }, emit) {
  const budget = Math.max(1, Math.min(Number(max_rows) || 5, 15));
  let domain;
  try {
    domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch {
    emit('error', { message: `"${website}" is not a valid website URL.` });
    return;
  }

  emit('step', { kind: 'start', text: `Target site: ${domain} · area: "${area}" · want ${budget} rows of: ${target_data}` });
  emit('step', { kind: 'info', text: `Search backend: ${SERPER_KEY ? 'Serper (Google)' : 'public engine scrape (best-effort)'}.` });

  const crawlOk = await robotsAllowsCrawl(domain);
  if (!crawlOk) {
    emit('step', { kind: 'warn', text: `robots.txt on ${domain} disallows crawling — will extract from search snippets only.` });
  } else {
    emit('step', { kind: 'info', text: `robots.txt check passed for ${domain}.` });
  }

  const queries = [
    `site:${domain} ${area}`,
    `site:${domain} ${area} for rent`,
    `${domain} ${area} ${target_data}`
  ];

  // web_search
  let results = [];
  for (const q of queries) {
    if (results.length >= budget * 3) break;
    emit('step', { kind: 'search', text: `Searching: ${q}` });
    const root = domain.split('.')[0];
    let hits = [];
    if (SERPER_KEY) {
      try { hits = await searchSerper(q, root); } catch { /* fall back to scraping */ }
    }
    if (!hits.length) {
      try { hits = await searchBing(q, root); } catch { /* try next engine */ }
    }
    if (!hits.length) {
      try { hits = await searchDdgLite(q, root); } catch { /* give up on this query */ }
    }
    emit('step', { kind: 'found', text: `${hits.length} pages found on ${domain}` });
    results.push(...hits);
  }

  // dedupe by URL
  const seen = new Set();
  results = results.filter((r) => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });

  if (!results.length) {
    emit('error', { message: 'No search results reachable for this site/area. The site may block search indexing — try another area or website.' });
    return;
  }
  emit('step', { kind: 'info', text: `${results.length} candidate pages queued. Extraction engine: ${llmAvailable() ? 'NVIDIA NIM' : 'pattern matching'}.` });

  const rows = [];
  for (const hit of results) {
    if (rows.length >= budget) break;
    const snippetText = [hit.title, hit.snippet].filter(Boolean).join('. ');
    let pageText = snippetText;
    let fetched = false;

    if (crawlOk) {
      emit('step', { kind: 'open', text: `Fetching ${hit.url.slice(0, 90)}` });
      try {
        const { status, text } = await get(hit.url);
        if (status === 200 && text.length > 500) {
          pageText = stripHtml(text);
          fetched = true;
        } else {
          emit('step', { kind: 'warn', text: `HTTP ${status} (bot-protected) — extracting from search snippet instead.` });
        }
      } catch {
        emit('step', { kind: 'warn', text: 'Fetch blocked/timed out — extracting from search snippet instead.' });
      }
    }

    if (!pageText || pageText.length < 15) {
      emit('step', { kind: 'skip', text: 'No usable text for this result, skipping.' });
      continue;
    }

    let extracted = [];
    if (llmAvailable()) {
      try {
        extracted = await llmExtract({ title: hit.title, text: pageText, target: target_data, area, url: hit.url });
      } catch {
        extracted = regexExtract({ title: hit.title, text: pageText, target: target_data, url: hit.url });
      }
    } else {
      extracted = regexExtract({ title: hit.title, text: pageText, target: target_data, url: hit.url });
    }

    if (!extracted.length) {
      emit('step', { kind: 'skip', text: `No "${target_data}" found on this page.` });
      continue;
    }
    for (const row of extracted) {
      if (rows.length >= budget) break;
      row._source = fetched ? 'page' : 'snippet';
      rows.push(row);
      emit('row', { row });
    }
    emit('step', { kind: 'success', text: `${extracted.length} row(s) extracted (${rows.length}/${budget}).` });
  }

  emit('done', { count: rows.length, requested: budget });
}
