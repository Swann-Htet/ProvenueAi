import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sourceProperties } from './agents/sourcing.js';
import { runWebScout } from './agents/webscout.js';
import { runBrowserScout, playwrightAvailable } from './agents/browserAgent.js';
import { extractFields, nextFollowup, CONFIDENCE_THRESHOLD, REQUIRED_FIELDS } from './agents/interview.js';
import { assembleContext, generateReport } from './agents/report.js';
import { generateProfileSummary } from './agents/summary.js';
import { handleChat } from './agents/insight.js';
import { initStore, insert, update, remove, all, get, uuid,
  createOwner, allOwners, getOwner, updateOwner, deleteOwner,
  createContract, getContractByToken, signContract,
  getDatasets, addDataset, deleteDataset,
  createConversation, getConversationsForUser, getMessages, createMessage, getUser, getAllUsers
} from './store.js';
import { authRouter, seedAdmin, requireAuth, requireAdmin, optionalAuth, adminUsersRouter } from './auth.js';
import { llmAvailable } from './adapters/llm.js';
import { dataLayerMode } from './adapters/sheets.js';
import { ZONES } from './seed/zones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5177;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    llm: llmAvailable() ? 'nvidia-nim' : 'deterministic-fallback',
    data_layer: dataLayerMode(),
    live_geo: process.env.LIVE_GEO === '1'
  });
});

app.get('/api/zones', (_req, res) => {
  res.json(ZONES.map((z) => ({ zone_id: z.zone_id, label: z.label, center: z.center })));
});

app.use('/api/auth', authRouter);
app.use('/api/admin/users', adminUsersRouter);

// ---------- Admin: Property Sourcing (Agent 1) — admin role only ----------

app.post('/api/admin/search', requireAdmin, async (req, res) => {
  try {
    const out = await sourceProperties(req.body || {});
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Web Scout: live search+scrape+extract with progress streamed as SSE so the
// admin's agent window updates in real time.
app.post('/api/admin/webscout', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders?.();

  const emit = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload, at: new Date().toISOString() })}\n\n`);
  };

  try {
    // Prefer the real-browser agent (human-like, streams screenshots); fall
    // back to the lightweight HTTP scraper if Playwright isn't installed.
    const mode = (req.body?.mode || 'auto');
    if (mode !== 'http' && (await playwrightAvailable())) {
      await runBrowserScout(req.body || {}, emit);
    } else {
      await runWebScout(req.body || {}, emit);
    }
  } catch (err) {
    emit('error', { message: err.message });
  }
  res.end();
});

// Only this endpoint writes to the Property DB — the agent never does.
app.post('/api/admin/properties/confirm', requireAdmin, async (req, res) => {
  const rows = req.body?.rows || [];
  const saved = [];
  for (const r of rows) {
    saved.push(await insert('properties', { id: uuid(), ...r, status: 'confirmed', admin_notes: r.admin_notes || '' }));
  }
  res.json({ saved });
});

// Demo convenience: run the sourcing agent over every seed zone and confirm
// the results, so the user-side flow has inventory on a fresh install.
app.post('/api/admin/seed-demo', requireAdmin, async (_req, res) => {
  const existing = await all('properties');
  if (existing.length) return res.json({ saved: [], note: 'Property DB already has rows — skipped.' });
  const saved = [];
  for (const z of ZONES) {
    const { results } = await sourceProperties({ area: z.label });
    for (const r of results) {
      saved.push(await insert('properties', { id: uuid(), ...r, status: 'confirmed', admin_notes: 'demo seed' }));
    }
  }
  res.json({ saved });
});

app.get('/api/admin/properties', requireAdmin, async (_req, res) => {
  res.json({ properties: await all('properties') });
});

app.patch('/api/admin/properties/:id', requireAdmin, async (req, res) => {
  const row = await update('properties', req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ property: row });
});

app.delete('/api/admin/properties/:id', requireAdmin, async (req, res) => {
  res.json({ deleted: await remove('properties', req.params.id) });
});

// ---------- Admin: Owner Onboarding & E-Contract ----------

app.get('/api/admin/owners', requireAdmin, async (_req, res) => {
  try { res.json({ owners: await allOwners() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/owners', requireAdmin, async (req, res) => {
  const { owner_name, phone, address } = req.body || {};
  if (!owner_name || !phone || !address) {
    return res.status(400).json({ error: 'owner_name, phone, and address are required' });
  }
  try { res.json({ owner: await createOwner(req.body) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/owners/:id', requireAdmin, async (req, res) => {
  const row = await updateOwner(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ owner: row });
});

app.delete('/api/admin/owners/:id', requireAdmin, async (req, res) => {
  res.json({ deleted: await deleteOwner(req.params.id) });
});

// Generate e-contract and return the signing link (token-based)
app.post('/api/admin/owners/:id/contract', requireAdmin, async (req, res) => {
  const owner = await getOwner(req.params.id);
  if (!owner) return res.status(404).json({ error: 'owner not found' });
  try {
    const contract = await createContract(req.params.id, req.body || {});
    const signingUrl = `${req.protocol}://${req.get('host')}/sign/${contract.signature_token}`;
    res.json({ contract, signing_url: signingUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List property from owner
app.post('/api/admin/owners/:id/list', requireAdmin, async (req, res) => {
  try {
    const owner = await getOwner(req.params.id);
    if (!owner) return res.status(404).json({ error: 'owner not found' });
    const payload = req.body || {};
    const propId = uuid();
    const propRow = {
      id: propId,
      owner_id: owner.id,
      property_name: payload.property_name || owner.owner_name + ' Property',
      address: payload.address || owner.address,
      monthly_rent_thb: payload.monthly_rent_thb ? Number(payload.monthly_rent_thb) : (owner.rent_price || 0),
      size_sqm: payload.size_sqm ? Number(payload.size_sqm) : (owner.area_size ? Number(owner.area_size) : 0),
      property_type: payload.property_type || 'shophouse',
      owner_contact: owner.phone,
      lat: payload.lat ? Number(payload.lat) : (owner.lat || null),
      lng: payload.lng ? Number(payload.lng) : (owner.lng || null),
      main_photo: payload.main_photo || null,
      status: 'available',
      source_url: 'owner_onboarding',
      scrape_confidence: 1.0
    };
    await insert('properties', propRow);
    await updateOwner(owner.id, { status: 'listed' });
    res.json({ property: propRow });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Public: Datasets (for map view / report pages) ----------

app.get('/api/public/datasets', async (_req, res) => {
  try {
    const list = await getDatasets();
    // Return all datasets but strip large Excel file_data blobs to keep response small
    const safe = list.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      source_type: d.source_type,
      created_at: d.created_at,
      row_count: Array.isArray(d.data) ? d.data.length : 1,
      // For JSON/API datasets include the actual data rows (small); for Excel just metadata
      data: d.source_type === 'Excel'
        ? d.data.map(r => ({ file_name: r.file_name }))
        : (d.data || [])
    }));
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/public/datasets/:id', async (req, res) => {
  try {
    const list = await getDatasets();
    const ds = list.find(d => d.id === req.params.id);
    if (!ds) return res.status(404).json({ error: 'not found' });
    res.json(ds);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public report endpoint — for demo map view (returns report without auth check;
// used by the standalone report-map.html page for demo purposes).
app.get('/api/public/reports/:id', async (req, res) => {
  try {
    const row = await get('reports', req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({
      id: row.id,
      profile: row.profile,
      report: row.report,
      candidates: row.candidates,
      zones: row.zones
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public property endpoint — for the public room information page
app.get('/api/public/properties/:id', async (req, res) => {
  try {
    let row = await get('properties', req.params.id);
    if (!row) {
      // Search across reports for mock candidates or embedded properties
      const reports = await all('reports');
      for (const r of reports) {
        const cand = (r.candidates || []).find(c => c.id === req.params.id || c.property_id === req.params.id);
        if (cand) {
          row = cand;
          break;
        }
      }
    }
    
    // Fallback: If still not found, return a random property from the database
    // so the Room Info page always displays something for demo purposes.
    if (!row) {
      const allProps = await all('properties');
      if (allProps && allProps.length > 0) {
        row = allProps[Math.floor(Math.random() * allProps.length)];
      }
    }
    
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Public / Chat API ----------

app.get('/api/public/properties/:id/owner', async (req, res) => {
  try {
    const propertyId = req.params.id;
    // Attempt to find property with same fallback logic as property details endpoint
    let property = await get('properties', propertyId);
    if (!property) {
      const reports = await all('reports');
      for (const r of reports) {
        const cand = (r.candidates || []).find(c => c.id === propertyId || c.property_id === propertyId);
        if (cand) {
          property = cand;
          break;
        }
      }
    }
    if (!property) {
      const allProps = await all('properties');
      if (allProps && allProps.length > 0) {
        property = allProps[Math.floor(Math.random() * allProps.length)];
      }
    }
    
    if (!property) return res.status(404).json({ error: 'Property not found' });
    
    let ownerId = property.owner_id || property.assigned_owner_account;

    if (!ownerId) {
      return res.status(404).json({ error: 'No site owner assigned to this property' });
    }
    
    console.log('GET OWNER FOR PROPERTY', propertyId, 'OWNER_ID', ownerId);
    const owner = await getUser(ownerId);
    console.log('FOUND OWNER', owner);
    if (!owner) return res.status(404).json({ error: 'Assigned owner account not found' });
    
    res.json({ id: owner.id, name: owner.name, role: owner.role, status: owner.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/conversations', optionalAuth, async (req, res) => {
  try {
    const { property_id, owner_id } = req.body;
    if (!property_id || !owner_id) return res.status(400).json({ error: 'property_id and owner_id required' });
    
    // create or get conversation
    const conv = await createConversation(property_id, req.user.sub, owner_id);
    
    // Check if there are any messages. If not, create the first automatic message.
    const msgs = await getMessages(conv.id);
    if (!msgs || msgs.length === 0) {
      await createMessage(conv.id, req.user.sub, "Hi! I found your property through Provenue AI and I'm interested in learning more. Is it still available?");
    }
    
    res.json(conv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/conversations', optionalAuth, async (req, res) => {
  try {
    const convs = await getConversationsForUser(req.user.sub);
    // Attach owner info and property info to each conversation for UI
    const enriched = await Promise.all(convs.map(async c => {
      const otherId = c.user_id === req.user.sub ? c.owner_id : c.user_id;
      const otherUser = await getUser(otherId);
      let property = await get('properties', c.property_id);
      
      // Attempt fallback for mock candidates if not in properties table
      if (!property) {
        const reports = await all('reports');
        for (const r of reports) {
          const cand = (r.candidates || []).find(cand => cand.id === c.property_id || cand.property_id === c.property_id);
          if (cand) { property = cand; break; }
        }
      }
      
      return { 
        ...c, 
        other_user: { id: otherUser?.id, name: otherUser?.name },
        property: property ? { id: property.id, property_name: property.property_name || property.address } : null
      };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/conversations/:id/messages', optionalAuth, async (req, res) => {
  try {
    const msgs = await getMessages(req.params.id);
    res.json(msgs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chat/conversations/:id/messages', optionalAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const newMsg = await createMessage(req.params.id, req.user.sub, message);
    if (global.wss) {
      global.wss.clients.forEach(client => {
        if (client.readyState === 1 /* WebSocket.OPEN */) {
          client.send(JSON.stringify({ type: 'NEW_MESSAGE', payload: newMsg }));
        }
      });
    }
    res.json(newMsg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Admin: Datasets ----------

app.get('/api/admin/datasets', requireAdmin, async (_req, res) => {
  try {
    const list = await getDatasets();
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/datasets', requireAdmin, async (req, res) => {
  try {
    const obj = await addDataset(req.body || {});
    res.json(obj);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/datasets/:id', requireAdmin, async (req, res) => {
  try {
    const ok = await deleteDataset(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------- Public: E-Contract signing (no auth — token is the secret) ----------

app.get('/api/contract/:token', async (req, res) => {
  const data = await getContractByToken(req.params.token);
  if (!data) return res.status(404).json({ error: 'contract not found or invalid link' });
  if (data.signature_status !== 'pending') {
    return res.json({ ...data, already_acted: true });
  }
  res.json(data);
});

app.post('/api/contract/:token/sign', async (req, res) => {
  const { action, custom_clauses } = req.body || {}; // 'signed' | 'rejected'
  if (!['signed','rejected'].includes(action)) {
    return res.status(400).json({ error: 'action must be "signed" or "rejected"' });
  }
  const result = await signContract(req.params.token, action, custom_clauses);
  if (!result) return res.status(404).json({ error: 'contract not found or invalid link' });
  res.json(result);
});

// ---------- User: Voice Interview (Agent 2) ----------

app.post('/api/interview/turn', requireAuth, async (req, res) => {
  try {
    const { transcript, state = {}, asked = [] } = req.body || {};
    let newState = { ...state };
    let extracted = [];
    if (transcript?.trim()) {
      extracted = await extractFields(transcript, state);
      for (const e of extracted) {
        // Guardrail: only auto-fill at/above the confidence threshold.
        if (e.confidence >= CONFIDENCE_THRESHOLD && e.value != null) {
          newState[e.field] = e.value;
        }
      }
    }
    const followup = nextFollowup(newState, asked);
    const confidence = Object.fromEntries(extracted.map((e) => [e.field, e.confidence]));
    res.json({ state: newState, extracted, field_confidence: confidence, ...followup, required_fields: REQUIRED_FIELDS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- User: Profile + Report (Agent 3) ----------

app.post('/api/profiles', requireAuth, async (req, res) => {
  const profile = req.body?.profile;
  if (!profile) return res.status(400).json({ error: 'profile required' });
  const missing = REQUIRED_FIELDS.filter((f) => profile[f] == null || profile[f] === '');
  if (missing.length) return res.status(400).json({ error: `missing required fields: ${missing.join(', ')}` });
  const saved = await insert('profiles', { profile, source: req.body.source || 'manual_form', user_id: req.user.sub });
  res.json({ id: saved.id });
});

// Intake wizard final-review step: NIM-backed recap of the in-progress form
// (not yet saved — the user may still Edit and come back before submitting).
app.post('/api/profiles/summary', requireAuth, async (req, res) => {
  try {
    const profile = req.body?.profile;
    if (!profile) return res.status(400).json({ error: 'profile required' });
    const out = await generateProfileSummary(profile);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    const { profileId, radius_m = 3000 } = req.body || {};
    const profileRow = await get('profiles', profileId);
    if (!profileRow) return res.status(404).json({ error: 'profile not found' });
    if (profileRow.user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'not your profile' });
    }
    const profile = profileRow.profile;

    // Candidate pool: confirmed properties within the radius of the user's
    // chosen location (or all confirmed if no location radius match).
    const confirmed = await all('properties', (p) => ['confirmed', 'listed'].includes(p.status));
    const loc = profile.location;
    let candidates = confirmed;
    if (loc?.lat) {
      const withDist = confirmed.map((p) => ({
        ...p,
        distance_m: Math.round(
          Math.sqrt(((p.lat - loc.lat) * 111320) ** 2 + ((p.lng - loc.lng) * 100000) ** 2)
        )
      }));
      candidates = withDist.filter((p) => p.distance_m <= radius_m);
      if (!candidates.length) candidates = withDist.sort((a, b) => a.distance_m - b.distance_m).slice(0, 5);
    }

    // NIM latency guard: a 70B model scoring many candidates with full zone
    // context routinely exceeds proxy timeouts. Keep the 4 nearest for the
    // LLM path; the deterministic engine handles any count instantly.
    if (llmAvailable() && candidates.length > 4) {
      candidates = [...candidates]
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
        .slice(0, 4);
    }

    const context = await assembleContext(profile, candidates);
    const report = await generateReport(context);

    const saved = await insert('reports', {
      profile_id: profileId,
      user_id: req.user.sub,
      profile,
      radius_m,
      candidates,
      zones: context.zones,
      report
    });
    res.json({ id: saved.id, report, candidates, zones: context.zones, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports', requireAuth, async (req, res) => {
  const rows = await all('reports', (r) => r.user_id === req.user.sub);
  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      project_name: r.profile?.project_name,
      location_label: r.profile?.location?.label,
      created_at: r.created_at
    }))
  });
});

app.get('/api/reports/:id', requireAuth, async (req, res) => {
  const row = await get('reports', req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.user_id !== req.user.sub && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'not your report' });
  }
  res.json({ id: row.id, report: row.report, candidates: row.candidates, zones: row.zones, profile: row.profile });
});

// ---------- Post-Report Chat (Agent 4) ----------

app.post('/api/reports/:id/chat', requireAuth, async (req, res) => {
  try {
    const row = await get('reports', req.params.id);
    if (!row) return res.status(404).json({ error: 'report not found' });
    if (row.user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'not your report' });
    }
    const { message, mapState } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    const out = await handleChat({
      message,
      mapState,
      profile: row.profile,
      forecast: row.report?.financial_forecast || null
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Static client (production) ----------

const distDir = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // Serve the custom map-view page for report detail routes
  app.get('/report/:id', (_req, res) => res.sendFile(path.join(distDir, 'report-map.html')));
  // Serve the detailed location analysis dashboard
  app.get('/analysis/:id', (_req, res) => res.sendFile(path.join(distDir, 'location-analysis.html')));
  // Serve the customer-facing room information page
  app.get('/room/:id', (_req, res) => res.sendFile(path.join(distDir, 'room-info.html')));
  // Serve the messaging page
  app.get('/messages', (_req, res) => res.sendFile(path.join(distDir, 'messages.html')));
  app.get('/messages/:id', (_req, res) => res.sendFile(path.join(distDir, 'messages.html')));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const backend = await initStore();
const seeded = await seedAdmin();
const server = app.listen(PORT, () => {
  console.log(`ProvenueAI API on http://localhost:${PORT}`);
  console.log(`  Store: ${backend}`);
  console.log(`  LLM: ${llmAvailable() ? 'NVIDIA NIM' : 'deterministic fallback (set NIM_API_KEY for NIM)'}`);
  console.log(`  Data layer: ${dataLayerMode()}`);
  if (seeded) console.log(`  Seeded admin account: ${seeded.email} / ${seeded.password} — change this password!`);
});

global.wss = new WebSocketServer({ server });
global.wss.on('connection', ws => {
  ws.on('error', console.error);
});
