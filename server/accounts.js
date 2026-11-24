'use strict';
/* ==========================================================
   الحسابات: تسجيل/دخول بكلمة مرور (scrypt)، جلسات، وسجلّ مباريات.
   التخزين: ملف JSON واحد (data/accounts.json أو ACCOUNTS_FILE).
   ========================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.ACCOUNTS_FILE || path.join(__dirname, '..', 'data', 'accounts.json');
const SESSION_MS = 30 * 24 * 3600_000;
const HISTORY_MAX = 50;

let db = { users: {}, sessions: {} };       // users: id → {...}؛ sessions: sha256(token) → {uid, at}
try { db = { users: {}, sessions: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* ملف جديد */ }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, FILE);
    } catch (e) { console.error('accounts save failed', e); }
  }, 200);
}
process.on('exit', () => { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch { /* ignore */ } });

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const clean = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

const byName = u => Object.values(db.users).find(x => x.username === u);

function newSession(uid) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[sha(token)] = { uid, at: Date.now() };
  save();
  return token;
}

function view(u) {
  const h = u.history || [];
  return {
    username: u.username, display: u.display, char: u.char ?? null, createdAt: u.createdAt,
    stats: { games: u.games ?? h.length, wins: u.wins ?? h.filter(g => g.won).length },
    history: h.slice(0, 20),
  };
}

function register(username, password, display) {
  username = clean(username, 20).toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { err: 'اسم المستخدم: 3–20 حرفًا (إنجليزية صغيرة، أرقام، _)' };
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) return { err: 'كلمة المرور 6 أحرف على الأقل' };
  if (byName(username)) return { err: 'اسم المستخدم مأخوذ' };
  const id = crypto.randomBytes(8).toString('hex'), salt = crypto.randomBytes(16).toString('hex');
  db.users[id] = { id, username, display: clean(display, 14) || username, salt, hash: hashPw(password, salt), createdAt: Date.now(), history: [] };
  return { user: view(db.users[id]), token: newSession(id) };
}

function login(username, password) {
  const u = byName(clean(username, 20).toLowerCase());
  const salt = u ? u.salt : '0'.repeat(32);
  const h = hashPw(typeof password === 'string' ? password.slice(0, 100) : '', salt);     // نفس الكلفة دائمًا
  if (!u || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash))) return { err: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  return { user: view(u), token: newSession(u.id) };
}

function uidOf(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const k = sha(token), s = db.sessions[k];
  if (!s) return null;
  if (Date.now() - s.at > SESSION_MS) { delete db.sessions[k]; save(); return null; }
  return db.users[s.uid] ? s.uid : null;
}
function logout(token) { if (typeof token === 'string') { delete db.sessions[sha(token)]; save(); } }
function me(token) { const id = uidOf(token); return id ? view(db.users[id]) : null; }
function displayOf(uid) { return db.users[uid] ? db.users[uid].display : null; }

function updateProfile(token, { display, char }) {
  const id = uidOf(token); if (!id) return null;
  const u = db.users[id];
  const d = clean(display, 14); if (d) u.display = d;
  if (Number.isInteger(char) && char >= 0 && char < 50) u.char = char;
  save();
  return view(u);
}

function recordGame(uid, entry) {
  const u = db.users[uid]; if (!u) return;
  u.games = (u.games ?? (u.history || []).length) + 1;
  u.wins = (u.wins ?? (u.history || []).filter(g => g.won).length) + (entry.won ? 1 : 0);
  u.history = [entry, ...(u.history || [])].slice(0, HISTORY_MAX);
  save();
}

module.exports = { register, login, uidOf, logout, me, displayOf, updateProfile, recordGame };
