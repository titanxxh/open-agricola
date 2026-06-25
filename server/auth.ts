import { scrypt, randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto'
import { getDb } from './db.ts'
import { nanoid } from 'nanoid'
import { getRegistrationPolicy } from './invites.ts'

const SCRYPT_KEYLEN = 64
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

export type AuthUser = {
  id: string
  username: string
  displayName: string
  email?: string | null
  emailVerified?: boolean
  isAdmin?: boolean
}

export type AuthErrorCode =
  | 'invalid_login'
  | 'invalid_email'
  | 'invalid_username'
  | 'invalid_password'
  | 'password_mismatch'
  | 'email_taken'
  | 'email_not_verified'
  | 'invalid_or_expired_token'
  | 'email_delivery_failed'
  | 'username_taken'
  | 'invalid_invite'
  | 'registration_disabled'
  | 'admin_required'
  | 'oauth_registration_required'
  | 'unsupported_oauth_provider'
  | 'oauth_state_invalid'
  | 'oauth_cancelled'
  | 'oauth_profile_failed'
  | 'oauth_identity_taken'
  | 'oauth_onboarding_required'
  | 'oauth_onboarding_expired'
  | 'not_authenticated'
  | 'rate_limited'
  | 'missing_fields'
  | 'invalid_display_name'
  | 'csrf_rejected'

export type AuthResult =
  | { ok: true; user: AuthUser; token?: string }
  | { ok: false; code: AuthErrorCode; error: string }

export type LoginResult =
  | { ok: true; user: AuthUser; token: string }
  | { ok: false; code: AuthErrorCode; error: string }

export type RegisterPasswordInput = {
  username: string
  email: string
  password: string
  confirmPassword: string
  displayName?: string
  inviteCode?: string
}

export type RegisterPasswordResult =
  | { ok: true; status: 'verification_required'; userId: string }
  | { ok: false; code: AuthErrorCode; error: string }

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function validateEmail(email: string): string | null {
  const normalized = normalizeEmail(email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Email is invalid'
  }
  if (normalized.length > 254) return 'Email is invalid'
  return null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function register(username: string, password: string, displayName?: string): Promise<AuthResult> {
  void username
  void password
  void displayName
  return { ok: false, code: 'oauth_registration_required', error: 'Registration requires GitHub or Google' }
}

export async function registerPasswordUser(input: RegisterPasswordInput): Promise<RegisterPasswordResult> {
  const policy = getRegistrationPolicy()
  if (policy === 'disabled') {
    return { ok: false, code: 'registration_disabled', error: 'Registration is disabled' }
  }
  if (policy !== 'open') {
    return { ok: false, code: 'invalid_invite', error: 'Invite code is required' }
  }

  const username = input.username.trim()
  const email = normalizeEmail(input.email)
  const usernameError = validateUsername(username)
  if (usernameError) return { ok: false, code: 'invalid_username', error: usernameError }
  const emailError = validateEmail(email)
  if (emailError) return { ok: false, code: 'invalid_email', error: emailError }
  if (!input.password || input.password.length < 8) {
    return { ok: false, code: 'invalid_password', error: 'Password must be at least 8 characters' }
  }
  if (input.password !== input.confirmPassword) {
    return { ok: false, code: 'password_mismatch', error: 'Passwords do not match' }
  }

  const db = getDb()
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username) || isUsernameReserved(username)) {
    return { ok: false, code: 'username_taken', error: 'Username already taken' }
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return { ok: false, code: 'email_taken', error: 'Email already taken' }
  }

  const id = nanoid()
  const passwordHash = await hashPassword(input.password)
  const now = Date.now()
  const name = input.displayName?.trim() || username
  db.prepare(`
    INSERT INTO users (
      id, username, email, email_verified_at, email_verification_sent_at,
      display_name, password_hash, password_updated_at, created_at
    )
    VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).run(id, username, email, name, passwordHash, now, now)

  return { ok: true, status: 'verification_required', userId: id }
}

export async function verifyEmailToken(token: string): Promise<AuthResult> {
  const tokenHash = hashToken(token)
  const now = Date.now()
  const row = getDb().prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.email_verified_at
    FROM email_verification_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
      AND t.used_at IS NULL
      AND t.expires_at > ?
      AND t.created_at >= ?
  `).get(tokenHash, now, now - EMAIL_VERIFICATION_TTL_MS) as
    | { id: string; username: string; display_name: string; email: string | null; email_verified_at: number | null }
    | undefined

  if (!row) {
    return { ok: false, code: 'invalid_or_expired_token', error: 'Invalid or expired token' }
  }

  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      emailVerified: row.email_verified_at !== null,
      isAdmin: isAdmin(row.username),
    },
  }
}

function validateUsername(username: string): string | null {
  if (!username || username.length < 2 || username.length > 30) {
    return 'Username must be 2-30 characters'
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fff]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, or Chinese characters'
  }
  return null
}

export async function createLocalUserForTests(
  username: string,
  password: string,
  displayName?: string,
): Promise<AuthUser> {
  username = username.trim()
  const usernameError = validateUsername(username)
  if (usernameError) throw new Error(usernameError)
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters')

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) throw new Error('Username already taken')

  const id = nanoid()
  const passwordHash = await hashPassword(password)
  const now = Date.now()
  const name = displayName?.trim() || username

  db.prepare(
    `INSERT INTO users (
      id, username, email, email_verified_at, email_verification_sent_at,
      display_name, password_hash, password_updated_at, created_at
    ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?)`,
  ).run(id, username, now, name, passwordHash, now, now)

  return { id, username, displayName: name }
}

export function createSession(userId: string): string {
  const now = Date.now()
  const token = randomUUID()
  const db = getDb()
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now + SESSION_TTL_MS, now)
  return token
}

export async function login(username: string, password: string): Promise<LoginResult> {
  if (!password) return { ok: false, code: 'invalid_login', error: 'Invalid username or password' }

  const db = getDb()
  const row = db.prepare(
    'SELECT id, username, display_name, password_hash, email, email_verified_at FROM users WHERE username = ?',
  ).get(username) as
    | {
      id: string
      username: string
      display_name: string
      password_hash: string
      email: string | null
      email_verified_at: number | null
    }
    | undefined

  if (!row) {
    return { ok: false, code: 'invalid_login', error: 'Invalid username or password' }
  }

  const valid = await verifyPassword(password, row.password_hash)
  if (!valid) {
    return { ok: false, code: 'invalid_login', error: 'Invalid username or password' }
  }
  if (row.email && row.email_verified_at === null) {
    return { ok: false, code: 'email_not_verified', error: 'Email is not verified' }
  }

  const now = Date.now()
  const token = createSession(row.id)
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, row.id)

  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      emailVerified: !row.email || row.email_verified_at !== null,
      isAdmin: isAdmin(row.username),
    },
    token,
  }
}

export function logout(token: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function logoutAll(userId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

const idPlaceholders = (ids: string[]): string => ids.map(() => '?').join(', ')

export function deleteAccount(userId: string): { ok: true } {
  const db = getDb()
  const now = Date.now()
  const userRow = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined
  const authoredCardIds = (db.prepare('SELECT id FROM workshop_cards WHERE author_id = ?').all(userId) as Array<{ id: string }>)
    .map(row => row.id)
  const affectedRoomIds = getAccountDeletionRoomIds(userId)

  db.transaction(() => {
    if (userRow && isAdmin(userRow.username)) {
      db.prepare(`
        INSERT OR IGNORE INTO reserved_usernames (username, reason, created_at)
        VALUES (?, 'deleted_admin', ?)
      `).run(userRow.username, now)
    }

    if (affectedRoomIds.length > 0) {
      db.prepare(`
        UPDATE rooms
        SET status = 'finished',
            state_json = NULL,
            created_by = CASE WHEN created_by = ? THEN NULL ELSE created_by END,
            updated_at = ?
        WHERE id IN (${idPlaceholders(affectedRoomIds)})
      `).run(userId, now, ...affectedRoomIds)
    }

    db.prepare('DELETE FROM github_propose_audit WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM github_propose_rate_limit WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM workshop_card_versions WHERE created_by = ?').run(userId)
    db.prepare('DELETE FROM card_likes WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM card_comments WHERE author_id = ?').run(userId)
    db.prepare('DELETE FROM sandbox_cards WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM sandbox_settings WHERE user_id = ?').run(userId)

    if (authoredCardIds.length > 0) {
      const placeholders = idPlaceholders(authoredCardIds)
      db.prepare(`DELETE FROM github_propose_audit WHERE workshop_card_id IN (${placeholders})`).run(...authoredCardIds)
      db.prepare(`DELETE FROM workshop_card_versions WHERE card_id IN (${placeholders})`).run(...authoredCardIds)
      db.prepare(`DELETE FROM card_likes WHERE card_id IN (${placeholders})`).run(...authoredCardIds)
      db.prepare(`DELETE FROM card_comments WHERE card_id IN (${placeholders})`).run(...authoredCardIds)
      db.prepare(`DELETE FROM sandbox_cards WHERE workshop_card_id IN (${placeholders})`).run(...authoredCardIds)
      db.prepare(`DELETE FROM workshop_cards WHERE id IN (${placeholders})`).run(...authoredCardIds)
    }

    db.prepare('DELETE FROM room_players WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM oauth_states WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM auth_identities WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  })()

  return { ok: true }
}

export function getAccountDeletionRoomIds(userId: string): string[] {
  return (getDb().prepare(`
    SELECT id FROM rooms WHERE created_by = ?
    UNION
    SELECT room_id AS id FROM room_players WHERE user_id = ?
  `).all(userId, userId) as Array<{ id: string }>).map(row => row.id)
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

export function isAdmin(username: string): boolean {
  return (process.env.ADMIN_USERS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .includes(username)
}

export function isUsernameReserved(username: string): boolean {
  const name = username.trim()
  if (!name) return false
  const row = getDb().prepare('SELECT 1 FROM reserved_usernames WHERE username = ?').get(name)
  return Boolean(row)
}

/** Change password. Returns error string or null on success. */
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<string | null> {
  if (!newPassword || newPassword.length < 8) return 'Password must be at least 8 characters'
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    | { password_hash: string } | undefined
  if (!row) return 'User not found'
  const valid = await verifyPassword(oldPassword, row.password_hash)
  if (!valid) return 'Current password is incorrect'
  const newHash = await hashPassword(newPassword)
  db.prepare('UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?').run(newHash, Date.now(), userId)
  return null
}
