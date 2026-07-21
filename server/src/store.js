// Persistence layer with two backends behind one async contract:
//   - MySQL/MariaDB (production) when MYSQL_HOST is set — collections are
//     stored as JSON documents keyed by id; users get a structured table.
//   - JSON file (local dev fallback) so the app still runs with zero setup.
// Routes only call the exported functions, so swapping backends is config.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = ['properties', 'profiles', 'reports', 'interviews', 'datasets', 'conversations', 'messages'];

// site_properties is structured so it gets its own MySQL table (not JSON blob)
const SITE_PROPS_COLS = ['id','user_id','area_size','rent_price','previous_usage','websites','location','notes','created_at','updated_at'];

export const uuid = () => crypto.randomUUID();

const useMysql = Boolean(process.env.MYSQL_HOST);

// ---------- MySQL backend ----------

let pool = null;

async function mysqlInit() {
  const mysql = await import('mysql2/promise');
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'provenue',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'provenueai',
    waitForConnections: true,
    connectionLimit: 10
  });
  for (const c of COLLECTIONS) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${c} (
        id VARCHAR(36) PRIMARY KEY,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      phone VARCHAR(30) DEFAULT NULL,
      password_hash VARCHAR(120) NOT NULL,
      role ENUM('sme','site','admin') NOT NULL DEFAULT 'sme',
      status ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS site_properties (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      area_size VARCHAR(100) DEFAULT NULL COMMENT 'e.g. 80-150 sqm',
      rent_price VARCHAR(100) DEFAULT NULL COMMENT 'monthly rent in THB',
      previous_usage TEXT DEFAULT NULL,
      websites JSON DEFAULT NULL COMMENT 'array of listing URLs',
      location JSON DEFAULT NULL COMMENT '{lat,lng,label}',
      notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS property_owners (
      id             VARCHAR(36)  PRIMARY KEY,
      owner_name     VARCHAR(120) NOT NULL,
      phone          VARCHAR(30)  NOT NULL,
      email          VARCHAR(190) DEFAULT NULL,
      address        TEXT         NOT NULL,
      area_size      VARCHAR(60)  DEFAULT NULL,
      rent_price     INT          DEFAULT NULL,
      previous_usage VARCHAR(60)  DEFAULT NULL,
      floor_count    TINYINT      DEFAULT 1,
      parking        TINYINT(1)   DEFAULT 0,
      photos         JSON         DEFAULT NULL,
      lat            DOUBLE       DEFAULT NULL,
      lng            DOUBLE       DEFAULT NULL,
      notes          TEXT         DEFAULT NULL,
      status         ENUM('draft','contract_sent','confirmed','denied','listed') NOT NULL DEFAULT 'draft',
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS contracts (
      id               VARCHAR(36)  PRIMARY KEY,
      owner_id         VARCHAR(36)  NOT NULL,
      commission_pct   DECIMAL(5,2) NOT NULL DEFAULT 10.00,
      duration_months  INT          NOT NULL DEFAULT 12,
      start_date       DATE         DEFAULT NULL,
      custom_clauses   TEXT         DEFAULT NULL,
      pdf_ref          TEXT         DEFAULT NULL,
      signature_token  VARCHAR(64)  NOT NULL UNIQUE,
      signature_status ENUM('pending','signed','rejected') NOT NULL DEFAULT 'pending',
      signed_at        TIMESTAMP    DEFAULT NULL,
      version          INT          NOT NULL DEFAULT 1,
      created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES property_owners(id) ON DELETE CASCADE
    )`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS contract_datasets (
      id          VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      dataset_id  VARCHAR(36) NOT NULL,
      created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )`
  );
}

const parseRow = (r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data);

// ---------- JSON-file backend ----------

const EMPTY = { properties: [], profiles: [], reports: [], interviews: [], users: [], site_properties: [], property_owners: [], contracts: [] };
let jsonDb = null;

function jsonLoad() {
  try {
    jsonDb = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch {
    jsonDb = structuredClone(EMPTY);
  }
}

function jsonPersist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(jsonDb, null, 2));
}

// ---------- shared contract ----------

export async function initStore() {
  if (useMysql) {
    await mysqlInit();
    return 'mysql';
  }
  jsonLoad();
  return 'json-file';
}

export async function insert(collection, row) {
  const withId = { id: row.id || uuid(), created_at: new Date().toISOString(), ...row };
  if (useMysql) {
    await pool.query(`INSERT INTO ${collection} (id, data) VALUES (?, ?)`, [withId.id, JSON.stringify(withId)]);
  } else {
    jsonDb[collection].push(withId);
    jsonPersist();
  }
  return withId;
}

export async function update(collection, id, patch) {
  const row = await get(collection, id);
  if (!row) return null;
  Object.assign(row, patch, { updated_at: new Date().toISOString() });
  if (useMysql) {
    await pool.query(`UPDATE ${collection} SET data = ? WHERE id = ?`, [JSON.stringify(row), id]);
  } else {
    const idx = jsonDb[collection].findIndex((r) => r.id === id);
    jsonDb[collection][idx] = row;
    jsonPersist();
  }
  return row;
}

export async function remove(collection, id) {
  if (useMysql) {
    const [res] = await pool.query(`DELETE FROM ${collection} WHERE id = ?`, [id]);
    return res.affectedRows > 0;
  }
  const before = jsonDb[collection].length;
  jsonDb[collection] = jsonDb[collection].filter((r) => r.id !== id);
  jsonPersist();
  return jsonDb[collection].length < before;
}

export async function all(collection, predicate) {
  let rows;
  if (useMysql) {
    const [res] = await pool.query(`SELECT data FROM ${collection}`);
    rows = res.map(parseRow);
  } else {
    rows = jsonDb[collection];
  }
  return predicate ? rows.filter(predicate) : rows;
}

export async function get(collection, id) {
  if (useMysql) {
    const [res] = await pool.query(`SELECT data FROM ${collection} WHERE id = ?`, [id]);
    return res.length ? parseRow(res[0]) : null;
  }
  return jsonDb[collection].find((r) => r.id === id) || null;
}

// ---------- users ----------

export async function createUser({ name, email, phone = null, password_hash, role = 'sme', status = 'active' }) {
  const user = { id: uuid(), name, email: email.toLowerCase(), phone, password_hash, role, status, created_at: new Date().toISOString() };
  if (useMysql) {
    await pool.query(
      'INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.email, user.phone, user.password_hash, user.role, user.status]
    );
  } else {
    jsonDb.users.push(user);
    jsonPersist();
  }
  return user;
}

export async function findUserByEmail(email) {
  const e = String(email || '').toLowerCase();
  if (useMysql) {
    const [res] = await pool.query('SELECT * FROM users WHERE email = ?', [e]);
    return res[0] || null;
  }
  return jsonDb.users.find((u) => u.email === e) || null;
}

export async function getUser(id) {
  if (useMysql) {
    const [res] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return res[0] || null;
  }
  return jsonDb.users.find((u) => u.id === id) || null;
}

export async function getAllUsers() {
  if (useMysql) {
    const [res] = await pool.query('SELECT id,name,email,phone,role,status,created_at FROM users ORDER BY created_at DESC');
    return res;
  }
  return jsonDb.users.map(({ password_hash, ...u }) => u);
}

export async function updateUser(id, patch) {
  const allowed = ['name','email','phone','role','status','password_hash'];
  const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(safe).length) return null;
  if (useMysql) {
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE users SET ${sets} WHERE id = ?`, [...Object.values(safe), id]);
    return getUser(id);
  }
  const u = jsonDb.users.find((u) => u.id === id);
  if (!u) return null;
  Object.assign(u, safe);
  jsonPersist();
  return u;
}

// ---------- site_properties ----------

export async function upsertSiteProperty(userId, data) {
  const id = uuid();
  const now = new Date().toISOString();
  if (useMysql) {
    // Upsert by user_id — one record per site user
    const [existing] = await pool.query('SELECT id FROM site_properties WHERE user_id = ?', [userId]);
    if (existing.length) {
      await pool.query(
        `UPDATE site_properties SET area_size=?,rent_price=?,previous_usage=?,websites=?,location=?,notes=?,updated_at=NOW() WHERE user_id=?`,
        [data.area_size||null, data.rent_price||null, data.previous_usage||null,
         JSON.stringify(data.websites||[]), JSON.stringify(data.location||null), data.notes||null, userId]
      );
      return existing[0].id;
    }
    await pool.query(
      `INSERT INTO site_properties (id,user_id,area_size,rent_price,previous_usage,websites,location,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [id, userId, data.area_size||null, data.rent_price||null, data.previous_usage||null,
       JSON.stringify(data.websites||[]), JSON.stringify(data.location||null), data.notes||null]
    );
    return id;
  }
  // JSON fallback
  const existing = jsonDb.site_properties.findIndex(r => r.user_id === userId);
  if (existing >= 0) {
    Object.assign(jsonDb.site_properties[existing], { ...data, updated_at: now });
    jsonPersist();
    return jsonDb.site_properties[existing].id;
  }
  const row = { id, user_id: userId, ...data, created_at: now, updated_at: now };
  jsonDb.site_properties.push(row);
  jsonPersist();
  return id;
}

export async function getSiteProperty(userId) {
  if (useMysql) {
    const [res] = await pool.query('SELECT * FROM site_properties WHERE user_id = ?', [userId]);
    if (!res.length) return null;
    const r = res[0];
    return { ...r, websites: typeof r.websites === 'string' ? JSON.parse(r.websites) : r.websites, location: typeof r.location === 'string' ? JSON.parse(r.location) : r.location };
  }
  return jsonDb.site_properties.find(r => r.user_id === userId) || null;
}

// ---------- property_owners ----------

export async function createOwner(data) {
  const id = uuid();
  const now = new Date().toISOString();
  if (useMysql) {
    await pool.query(
      `INSERT INTO property_owners (id,owner_name,phone,email,address,area_size,rent_price,previous_usage,floor_count,parking,photos,lat,lng,notes,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')`,
      [id, data.owner_name, data.phone, data.email||null, data.address,
       data.area_size||null, data.rent_price||null, data.previous_usage||null,
       data.floor_count||1, data.parking?1:0, JSON.stringify(data.photos||[]),
       data.lat||null, data.lng||null, data.notes||null]
    );
    return getOwner(id);
  }
  const row = { id, ...data, photos: data.photos||[], status: 'draft', created_at: now, updated_at: now };
  jsonDb.property_owners = jsonDb.property_owners || [];
  jsonDb.property_owners.push(row);
  jsonPersist();
  return row;
}

export async function allOwners() {
  if (useMysql) {
    const [rows] = await pool.query(
      `SELECT o.*,
              c.id AS contract_id, c.commission_pct, c.duration_months,
              c.signature_status, c.signature_token, c.signed_at, c.created_at AS contract_created_at
       FROM property_owners o
       LEFT JOIN contracts c ON c.owner_id = o.id AND c.version = (
         SELECT MAX(version) FROM contracts WHERE owner_id = o.id
       )
       ORDER BY o.created_at DESC`
    );
    return rows.map(r => ({
      ...r,
      photos: typeof r.photos === 'string' ? JSON.parse(r.photos) : (r.photos || []),
      parking: Boolean(r.parking)
    }));
  }
  const owners = jsonDb.property_owners || [];
  const contracts = jsonDb.contracts || [];
  return owners.map(o => {
    const latest = contracts.filter(c => c.owner_id === o.id).sort((a,b) => b.version - a.version)[0];
    return { ...o, ...(latest ? { contract_id: latest.id, commission_pct: latest.commission_pct, duration_months: latest.duration_months, signature_status: latest.signature_status, signature_token: latest.signature_token, signed_at: latest.signed_at } : {}) };
  }).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function getOwner(id) {
  if (useMysql) {
    const [res] = await pool.query('SELECT * FROM property_owners WHERE id = ?', [id]);
    if (!res.length) return null;
    const r = res[0];
    return { ...r, photos: typeof r.photos === 'string' ? JSON.parse(r.photos) : (r.photos||[]), parking: Boolean(r.parking) };
  }
  return (jsonDb.property_owners || []).find(r => r.id === id) || null;
}

export async function updateOwner(id, data) {
  const now = new Date().toISOString();
  if (useMysql) {
    const allowed = ['owner_name','phone','email','address','area_size','rent_price','previous_usage','floor_count','parking','lat','lng','notes','status'];
    const safe = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(safe).length) return getOwner(id);
    if ('parking' in safe) safe.parking = safe.parking ? 1 : 0;
    const sets = Object.keys(safe).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE property_owners SET ${sets}, updated_at=NOW() WHERE id = ?`, [...Object.values(safe), id]);
    return getOwner(id);
  }
  const idx = (jsonDb.property_owners || []).findIndex(r => r.id === id);
  if (idx < 0) return null;
  Object.assign(jsonDb.property_owners[idx], data, { updated_at: now });
  jsonPersist();
  return jsonDb.property_owners[idx];
}

export async function deleteOwner(id) {
  if (useMysql) {
    const [res] = await pool.query('DELETE FROM property_owners WHERE id = ?', [id]);
    return res.affectedRows > 0;
  }
  const before = (jsonDb.property_owners || []).length;
  jsonDb.property_owners = (jsonDb.property_owners || []).filter(r => r.id !== id);
  jsonPersist();
  return jsonDb.property_owners.length < before;
}

// ---------- contracts ----------

function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 48; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

export async function createContract(ownerId, data) {
  const id = uuid();
  const token = genToken();
  const now = new Date().toISOString();
  // Get max version for this owner
  let version = 1;
  if (useMysql) {
    const [vres] = await pool.query('SELECT MAX(version) AS v FROM contracts WHERE owner_id = ?', [ownerId]);
    version = (vres[0]?.v || 0) + 1;
    await pool.query(
      `INSERT INTO contracts (id,owner_id,commission_pct,duration_months,start_date,custom_clauses,signature_token,version)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, ownerId, data.commission_pct||10, data.duration_months||12, data.start_date||null,
       data.custom_clauses||null, token, version]
    );
    // Update owner status
    await pool.query("UPDATE property_owners SET status='contract_sent', updated_at=NOW() WHERE id=?", [ownerId]);
    const [cres] = await pool.query('SELECT * FROM contracts WHERE id = ?', [id]);
    return { ...cres[0], owner: await getOwner(ownerId) };
  }
  jsonDb.contracts = jsonDb.contracts || [];
  const prevMax = (jsonDb.contracts || []).filter(c => c.owner_id === ownerId).reduce((m,c) => Math.max(m, c.version), 0);
  version = prevMax + 1;
  const row = { id, owner_id: ownerId, ...data, commission_pct: data.commission_pct||10, duration_months: data.duration_months||12, start_date: data.start_date||null, custom_clauses: data.custom_clauses||null, signature_token: token, signature_status: 'pending', signed_at: null, version, created_at: now };
  jsonDb.contracts.push(row);
  // update owner status
  const oi = (jsonDb.property_owners||[]).findIndex(r => r.id === ownerId);
  if (oi >= 0) { jsonDb.property_owners[oi].status = 'contract_sent'; jsonDb.property_owners[oi].updated_at = now; }
  jsonPersist();
  return { ...row, owner: await getOwner(ownerId) };
}

export async function getContractByToken(token) {
  if (useMysql) {
    const [cres] = await pool.query('SELECT * FROM contracts WHERE signature_token = ?', [token]);
    if (!cres.length) return null;
    const c = cres[0];
    const owner = await getOwner(c.owner_id);
    let dres = [];
    try {
      const q2 = 'SELECT id,title,description,size_bytes,updated_at,layer_type FROM datasets WHERE id IN (SELECT dataset_id FROM contract_datasets WHERE contract_id = ?)';
      const [rows] = await pool.query(q2, [c.id]);
      dres = rows;
    } catch (e) {
      // contract_datasets table may not exist yet — non-fatal
    }
    return { ...c, owner, datasets: dres };
  }
  const c = (jsonDb.contracts || []).find(r => r.signature_token === token);
  if (!c) return null;
  return { ...c, owner: await getOwner(c.owner_id) };
}

// ---------- Chat / Messaging ----------

export async function createConversation(propertyId, userId, ownerId) {
  const existing = await all('conversations', c => c.property_id === propertyId && c.user_id === userId && c.owner_id === ownerId);
  if (existing && existing.length > 0) return existing[0];
  
  const conversation = {
    id: uuid(),
    property_id: propertyId,
    user_id: userId,
    owner_id: ownerId,
    created_at: new Date().toISOString()
  };
  return insert('conversations', conversation);
}

export async function getConversationsForUser(userId) {
  return all('conversations', c => c.user_id === userId || c.owner_id === userId);
}

export async function getMessages(conversationId) {
  const msgs = await all('messages', m => m.conversation_id === conversationId);
  return msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function createMessage(conversationId, senderId, messageText) {
  const msg = {
    id: uuid(),
    conversation_id: conversationId,
    sender_id: senderId,
    message: messageText,
    type: 'text',
    is_read: false,
    created_at: new Date().toISOString()
  };
  return insert('messages', msg);
}

export async function signContract(token, action, custom_clauses) {
  // action: 'signed' | 'rejected'
  const now = new Date().toISOString();
  if (useMysql) {
    const [cres] = await pool.query('SELECT * FROM contracts WHERE signature_token = ?', [token]);
    if (!cres.length) return null;
    const c = cres[0];
    const sigStatus = action === 'signed' ? 'signed' : 'rejected';
    const ownerStatus = action === 'signed' ? 'confirmed' : 'denied';
    if (custom_clauses && action === 'signed') {
       await pool.query('UPDATE contracts SET signature_status=?, signed_at=NOW(), custom_clauses=? WHERE id=?', [sigStatus, custom_clauses, c.id]);
    } else {
       await pool.query('UPDATE contracts SET signature_status=?, signed_at=NOW() WHERE id=?', [sigStatus, c.id]);
    }
    await pool.query("UPDATE property_owners SET status=?, updated_at=NOW() WHERE id=?", [ownerStatus, c.owner_id]);
    return { contract_id: c.id, owner_id: c.owner_id, result: ownerStatus };
  }
  const ci = (jsonDb.contracts || []).findIndex(r => r.signature_token === token);
  if (ci < 0) return null;
  const c = jsonDb.contracts[ci];
  const sigStatus = action === 'signed' ? 'signed' : 'rejected';
  const ownerStatus = action === 'signed' ? 'confirmed' : 'denied';
  jsonDb.contracts[ci].signature_status = sigStatus;
  jsonDb.contracts[ci].signed_at = now;
  if (custom_clauses && action === 'signed') {
     jsonDb.contracts[ci].custom_clauses = custom_clauses;
  }
  const oi = (jsonDb.property_owners||[]).findIndex(r => r.id === c.owner_id);
  if (oi >= 0) { jsonDb.property_owners[oi].status = ownerStatus; jsonDb.property_owners[oi].updated_at = now; }
  jsonPersist();
  return { contract_id: c.id, owner_id: c.owner_id, result: ownerStatus };
}

// ---------- Datasets ----------

export async function getDatasets() {
  if (useMysql) {
    const [rows] = await pool.query("SELECT * FROM datasets");
    return rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  }
  return jsonDb.datasets || [];
}

export async function addDataset(ds) {
  const id = uuid();
  const now = new Date().toISOString();
  const obj = { id, ...ds, created_at: now, updated_at: now };
  if (useMysql) {
    await pool.query("INSERT INTO datasets (id, data) VALUES (?, ?)", [id, JSON.stringify(obj)]);
  } else {
    jsonDb.datasets = jsonDb.datasets || [];
    jsonDb.datasets.push(obj);
    jsonPersist();
  }
  return obj;
}

export async function deleteDataset(id) {
  if (useMysql) {
    await pool.query("DELETE FROM datasets WHERE id=?", [id]);
    return true;
  }
  if (!jsonDb.datasets) return false;
  jsonDb.datasets = jsonDb.datasets.filter(r => r.id !== id);
  jsonPersist();
  return true;
}
