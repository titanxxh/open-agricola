import { scrypt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getDb } from './db.ts'
import { nanoid } from 'nanoid'

const SCRYPT_KEYLEN = 64
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type AuthUser = {
  id: string
  username: string
  displayName: string
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex')
    scrypt(password, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) reject(err)
      else resolve(`${salt}:${derived.toString('hex')}`)
    })
  })
}

function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':')
    scrypt(password, salt, SCRYPT_KEYLEN, (err, derived) => {
      if (err) reject(err)
      else {
        const hashBuf = Buffer.from(hash, 'hex')
        resolve(hashBuf.length === derived.length && timingSafeEqual(hashBuf, derived))
      }
    })
  })
}

export type AuthResult =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; error: string }

export async function register(username: string, password: string, displayName?: string): Promise<AuthResult> {
  username = username.trim()
  if (!username || username.length < 2 || username.length > 30) {
    return { ok: false, error: 'Username must be 2-30 characters' }
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(username)) {
    return { ok: false, error: 'Username can only contain letters, numbers, underscores, or Chinese characters' }
  }
  if (!password || password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters' }
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return { ok: false, error: 'Username already taken' }
  }

  const id = nanoid()
  const passwordHash = await hashPassword(password)
  const now = Date.now()
  const name = displayName?.trim() || username

  db.prepare(
    'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, username, name, passwordHash, now)

  const token = randomUUID()
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(token, id, now + SESSION_TTL_MS, now)

  return { ok: true, user: { id, username, displayName: name }, token }
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const db = getDb()
  const row = db.prepare(
    'SELECT id, username, display_name, password_hash FROM users WHERE username = ?',
  ).get(username) as { id: string; username: string; display_name: string; password_hash: string } | undefined

  if (!row) {
    return { ok: false, error: 'Invalid username or password' }
  }

  const valid = await verifyPassword(password, row.password_hash)
  if (!valid) {
    return { ok: false, error: 'Invalid username or password' }
  }

  const now = Date.now()
  const token = randomUUID()
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(token, row.id, now + SESSION_TTL_MS, now)
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id)

  return { ok: true, user: { id: row.id, username: row.username, displayName: row.display_name }, token }
}

export function logout(token: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function validateSession(token: string): AuthUser | null {
  if (!token) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, Date.now()) as { id: string; username: string; display_name: string } | undefined

  if (!row) return null
  return { id: row.id, username: row.username, displayName: row.display_name }
}

/** Extract bearer token from Authorization header. */
export function extractToken(authHeader: string | undefined): string {
  if (!authHeader) return ''
  const match = /^Bearer\s+(.+)$/i.exec(authHeader)
  return match ? match[1] : ''
}

/** Update a user's display name. Returns error string or null on success. */
export function updateDisplayName(userId: string, displayName: string): string | null {
  const name = displayName.trim()
  if (!name || name.length > 60) return 'Display name must be 1-60 characters'
  const db = getDb()
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId)
  return null
}

/** Check if a username is an admin (configured via ADMIN_USERS env var). */
const ADMIN_USERNAMES = new Set(
  (process.env.ADMIN_USERS ?? '').split(',').map(s => s.trim()).filter(Boolean),
)
export function isAdmin(username: string): boolean {
  return ADMIN_USERNAMES.has(username)
}

/** Change password. Returns error string or null on success. */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  if (!newPassword || newPassword.length < 4) return 'Password must be at least 4 characters'
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string } | undefined
  if (!row) return 'User not found'
  const valid = await verifyPassword(oldPassword, row.password_hash)
  if (!valid) return 'Current password is incorrect'
  const newHash = await hashPassword(newPassword)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId)
  return null
}

