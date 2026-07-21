// Human-like browsing agent: drives a real Chromium browser (Playwright) the
// way a person would — opens the target website, finds its search box, types
// the area, browses the result listings, and reads each page for the data the
// admin asked for. Live screenshots + narration stream to the admin's window
// so they watch the agent work. Falls back to the HTTP scraper when a browser
// isn't available (e.g. local dev without Playwright installed).
//
// This uses a genuine browser (executes JS, real fingerprint), so it reaches
// SPA/JS sites that block raw fetch. It only visits public pages and never
// tries to solve CAPTCHAs or bypass logins — if it hits one, it says so.

import { chatJSON, llmAvailable } from '../adapters/llm.js';

const NAV_TIMEOUT = 25000;
const VIEWPORT = { width: 1100, height: 780 };
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PHONE_RE = /(?:\+66|0)\d{1,2}[-\s.]?\d{3}[-\s.]?\d{3,4}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PRICE_RE = /(?:฿|THB|บาท)\s?[\d][\d,]{2,}|[\d][\d,]{2,}\s?(?:฿|THB|บาท|baht)/gi;

export async function playwrightAvailable() {
  try { await import('playwright'); return true; } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(page, emit, caption) {
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 45 });
    emit('screenshot', { image: buf.toString('base64'), caption });
  } catch { /* page may be navigating */ }
}

function regexExtract(text, target, url, title) {
  const row = { title: title || '(untitled)', source_url: url };
  const t = target.toLowerCase();
  const phones = [...new Set(text.match(PHONE_RE) || [])].slice(0, 4);
  const emails = [...new Set(text.match(EMAIL_RE) || [])].slice(0, 3);
  const prices = [...new Set(text.match(PRICE_RE) || [])].slice(0, 3);
  if (/ph|phone|contact|tel|num/.test(t)) row.phone = phones.join(', ') || null;
  if (/mail/.test(t)) row.email = emails.join(', ') || null;
  if (/price|rent|cost|฿|baht/.test(t)) row.price = prices.join(', ') || null;
  if (!('phone' in row) && phones.length) row.phone = phones.join(', ');
  if (!('email' in row) && emails.length) row.email = emails.join(', ');
  if (!('price' in row) && prices.length) row.price = prices.join(', ');
  return row;
}

async function extract({ text, title, url, target, area }) {
  if (llmAvailable()) {
    try {
      const out = await chatJSON({
        system:
          'You read one web page and extract the data an admin asked for into STRICT JSON: {"row":{...}}. ' +
          'Keys are short snake_case. Always include "title". Include the requested field plus useful context ' +
          '(address, price, phone, email) WHEN present in the text. NEVER invent values — omit a key if absent. ' +
          'If the page has none of the requested data, return {"row":null}.',
        user: `REQUESTED: ${target}\nAREA: ${area}\nTITLE: ${title}\nURL: ${url}\nPAGE TEXT:\n${text.slice(0, 6000)}`,
        maxTokens: 500
      });
      if (out?.row && typeof out.row === 'object') return { ...out.row, title: out.row.title || title, source_url: url };
      if (out?.row === null) return null;
    } catch { /* fall back */ }
  }
  return regexExtract(text, target, url, title);
}

// Find and use the site's own search box, the way a person would.
async function humanSearch(page, area, emit) {
  const selectors = [
    'input[type="search"]',
    'input[name*="search" i]', 'input[name*="query" i]', 'input[name="q"]', 'input[name*="keyword" i]',
    'input[placeholder*="search" i]', 'input[placeholder*="location" i]', 'input[placeholder*="area" i]',
    'input[aria-label*="search" i]'
  ];
  for (const sel of selectors) {
    const box = await page.$(sel);
    if (!box) continue;
    try {
      await box.scrollIntoViewIfNeeded();
      await box.click({ timeout: 3000 });
      emit('step', { kind: 'search', text: `Found a search box — typing "${area}" like a person would.` });
      await box.type(area, { delay: 45 });
      await shoot(page, emit, `Typing "${area}" into the search box`);
      await sleep(400);
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
      emit('step', { kind: 'search', text: 'Submitted the search, waiting for results to load.' });
      return true;
    } catch { /* try next selector */ }
  }
  return false;
}

async function collectListingLinks(page, root, max) {
  return page.$$eval(
    'a[href]',
    (as, args) => {
      const { root, max } = args;
      const seen = new Set();
      const out = [];
      const bad = /(login|register|signin|signup|about|contact-us|privacy|terms|career|help|faq|blog\/?$|#)/i;
      for (const a of as) {
        let href = a.href;
        if (!href || bad.test(href)) continue;
        let u;
        try { u = new URL(href); } catch { continue; }
        if (!u.hostname.includes(root)) continue;
        const depth = u.pathname.split('/').filter(Boolean).length;
        if (depth < 1) continue; // skip bare homepage/nav anchors
        const key = u.origin + u.pathname;
        if (seen.has(key)) continue;
        seen.add(key);
        const title = (a.textContent || '').replace(/\s+/g, ' ').trim();
        out.push({ url: key, title: title.slice(0, 140) });
        if (out.length >= max) break;
      }
      return out;
    },
    { root, max: max * 3 }
  );
}

export async function runBrowserScout({ website, area, max_rows = 5, target_data = 'phone number' }, emit) {
  const budget = Math.max(1, Math.min(Number(max_rows) || 5, 12));
  let target;
  try {
    target = website.startsWith('http') ? website : `https://${website}`;
    new URL(target);
  } catch {
    emit('error', { message: `"${website}" is not a valid website URL.` });
    return;
  }
  const domain = new URL(target).hostname.replace(/^www\./, '');
  const root = domain.split('.')[0];

  const { chromium } = await import('playwright');
  emit('step', { kind: 'start', text: `Starting the AI browsing agent — it will use ${domain} like a human.` });
  emit('step', { kind: 'info', text: `Extraction engine: ${llmAvailable() ? 'NVIDIA NIM' : 'pattern matching'} · target: ${target_data}` });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ userAgent: UA, viewport: VIEWPORT, locale: 'en-US' });
  const page = await context.newPage();

  try {
    emit('step', { kind: 'navigate', text: `Opening ${target}` });
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await sleep(600);
    await shoot(page, emit, `Opened ${domain}`);

    // Dismiss a cookie banner if there's an obvious accept button (human would).
    for (const label of ['Accept', 'Accept all', 'ยอมรับ', 'I agree', 'Got it']) {
      const btn = await page.$(`button:has-text("${label}")`).catch(() => null);
      if (btn) { await btn.click().catch(() => {}); emit('step', { kind: 'info', text: `Dismissed a cookie banner ("${label}").` }); await sleep(400); break; }
    }

    emit('step', { kind: 'scan', text: 'Looking for the site\'s search box.' });
    const searched = await humanSearch(page, area, emit);
    if (!searched) {
      emit('step', { kind: 'warn', text: `No search box found on the homepage — scanning links for "${area}" instead.` });
    }
    await sleep(800);
    await shoot(page, emit, searched ? `Search results for "${area}"` : `Home page of ${domain}`);

    // Detect a hard block / captcha honestly rather than pretending.
    const pageTitle = (await page.title().catch(() => '')).toLowerCase();
    const bodyText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).toLowerCase();
    const blockSigns = /captcha|are you a robot|verify you are human|unusual traffic|performing security verification|security service to protect|checking your browser|cloudflare|ray id|access denied|attention required/;
    if (blockSigns.test(bodyText) || blockSigns.test(pageTitle)) {
      emit('step', { kind: 'block', text: 'The site is showing a Cloudflare/CAPTCHA "verify you are human" wall.' });
      emit('error', { message: `${domain} blocks automated visitors with a CAPTCHA/security wall (visible in the browser view above). I don't bypass CAPTCHAs. Try a site without one, or use that site's official listing feed/API.` });
      return;
    }

    emit('step', { kind: 'scan', text: 'Collecting listing links from the page.' });
    let links = await collectListingLinks(page, root, budget);
    // Filter to links whose text hints at the area when possible.
    const areaWord = area.split(/[, ]/)[0].toLowerCase();
    const preferred = links.filter((l) => l.title.toLowerCase().includes(areaWord) || l.url.toLowerCase().includes(areaWord));
    if (preferred.length) links = preferred.concat(links.filter((l) => !preferred.includes(l)));
    emit('step', { kind: 'found', text: `Found ${links.length} candidate listing pages. Opening them one by one.` });

    if (!links.length) {
      emit('error', { message: `Reached ${domain} but couldn't find listing links for "${area}". The site layout may need a specific search URL.` });
      return;
    }

    let count = 0;
    for (const link of links) {
      if (count >= budget) break;
      emit('step', { kind: 'open', text: `Opening: ${link.title || link.url.slice(0, 70)}` });
      try {
        await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        await sleep(500);
        await shoot(page, emit, link.title || 'Listing page');
        const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const title = (await page.title().catch(() => '')) || link.title;
        emit('step', { kind: 'read', text: `Reading the page for "${target_data}".` });
        const row = await extract({ text, title, url: link.url, target: target_data, area });
        if (row) {
          count++;
          emit('row', { row });
          emit('step', { kind: 'success', text: `Extracted row ${count}/${budget}.` });
        } else {
          emit('step', { kind: 'skip', text: `Nothing matching "${target_data}" on this page.` });
        }
      } catch (err) {
        emit('step', { kind: 'fail', text: `Couldn't open this page (${String(err.message).slice(0, 50)}).` });
      }
    }

    emit('done', { count, requested: budget });
  } catch (err) {
    emit('error', { message: `Browser agent error: ${err.message}` });
  } finally {
    await browser.close().catch(() => {});
  }
}
