// User accounts: register/login with bcrypt-hashed passwords and JWT
// sessions. An admin account is seeded on boot (ADMIN_EMAIL/ADMIN_PASSWORD
// env, with dev defaults) so the Admin Console is reachable immediately.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail, getUser, getAllUsers, updateUser, upsertSiteProperty, getSiteProperty } from './store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'provenueai-dev-secret-change-me';
const TOKEN_TTL = '7d';

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@provenue.ai';
  if (await findUserByEmail(email)) return null;
  const password = process.env.ADMIN_PASSWORD || 'Provenue@2026';
  await createUser({
    name: 'Administrator',
    email,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'admin'
  });
  return { email, password };
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role, status: u.status || 'active' });
const signToken = (u) => jwt.sign({ sub: u.id, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body || {};
    if (!name?.trim() || !email?.includes('@') || (password || '').length < 8) {
      return res.status(400).json({ error: 'Name, a valid email, and a password of at least 8 characters are required.' });
    }
    // Only allow 'sme' or 'site' from public register — admin is seeded only
    const allowedRoles = ['sme', 'site', 'owner'];
    const assignedRole = allowedRoles.includes(role) ? role : 'sme';
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const user = await createUser({
      name: name.trim(),
      email,
      phone: phone?.trim() || null,
      password_hash: bcrypt.hashSync(password, 10),
      role: assignedRole
    });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUser(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  res.json({ user: publicUser(user) });
});

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || token === 'null') {
    req.user = { sub: 'guest-user', name: 'Guest', role: 'sme' };
    return next();
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    req.user = { sub: 'guest-user', name: 'Guest', role: 'sme' };
    next();
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — sign in again.' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    next();
  });
}

// ---------- Admin: User Management ----------
export const adminUsersRouter = Router();

// GET /api/admin/users — list all users (no password_hash)
adminUsersRouter.get('/', requireAdmin, async (req, res) => {
  try {
    res.json({ users: await getAllUsers() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/users — admin creates a user (any role including 'site'/'sme')
adminUsersRouter.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, role, siteData } = req.body || {};
    if (!name?.trim() || !email?.includes('@') || (password || '').length < 8) {
      return res.status(400).json({ error: 'Name, email, and password (min 8) are required.' });
    }
    const allowed = ['sme','site','admin','owner'];
    const assignedRole = allowed.includes(role) ? role : 'sme';
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email already exists.' });
    }
    const user = await createUser({
      name: name.trim(), email,
      phone: phone?.trim() || null,
      password_hash: bcrypt.hashSync(password, 10),
      role: assignedRole
    });
    // If site user, optionally seed site_properties
    if (assignedRole === 'site' && siteData) {
      await upsertSiteProperty(user.id, siteData);
    }
    res.status(201).json({ user: publicUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/admin/users/:id — update user fields
adminUsersRouter.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { password, siteData, ...patch } = req.body || {};
    if (password) patch.password_hash = bcrypt.hashSync(password, 10);
    const user = await updateUser(req.params.id, patch);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (siteData) await upsertSiteProperty(req.params.id, siteData);
    res.json({ user: publicUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/users/:id/site-property
adminUsersRouter.get('/:id/site-property', requireAdmin, async (req, res) => {
  try {
    const sp = await getSiteProperty(req.params.id);
    res.json({ site_property: sp });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/users/:id/site-property
adminUsersRouter.put('/:id/site-property', requireAdmin, async (req, res) => {
  try {
    const id = await upsertSiteProperty(req.params.id, req.body || {});
    res.json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
