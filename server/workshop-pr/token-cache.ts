import { nanoid } from 'nanoid'
import { getDb } from '../db'
import type { PostgresDatabase } from '../database/postgres'
import { TokenCipher } from '../bug-report/bug-report-store'

type TokenRow = {
  user_id: string
  token_ciphertext: Buffer
  token_nonce: Buffer
  token_tag: Buffer
  token_key_id: string
}

/** Shared, expiring OAuth handshake. Callback and token consumption each happen once. */
export class TokenCache {
  private readonly ttlMs: number
  private readonly database: () => PostgresDatabase
  private readonly encryption: () => TokenCipher
  constructor(
    ttlMs = 60_000,
    database: () => PostgresDatabase = getDb,
    encryption: () => TokenCipher = () => {
      const key = process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY
      if (!key) throw new Error('WORKSHOP_TOKEN_ENCRYPTION_KEY is required for Workshop OAuth')
      return new TokenCipher('workshop-v1', new Map([['workshop-v1', Buffer.from(key, 'base64')]]))
    },
  ) {
    this.ttlMs = ttlMs
    this.database = database
    this.encryption = encryption
  }

  async allocateHandshakeId(userId: string): Promise<string> {
    const id = nanoid(32)
    await this.database().prepare('INSERT INTO workshop_oauth_handshakes (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(id, userId, Date.now() + this.ttlMs)
    return id
  }

  async hasPending(id: string): Promise<boolean> {
    return Boolean(await this.database().prepare(`
      SELECT 1 FROM workshop_oauth_handshakes
      WHERE id = ? AND expires_at > ? AND callback_claimed = 0 AND token_ciphertext IS NULL
    `).get(id, Date.now()))
  }

  async claimCallback(id: string): Promise<boolean> {
    return (await this.database().prepare(`
      UPDATE workshop_oauth_handshakes SET callback_claimed = 1
      WHERE id = ? AND expires_at > ? AND callback_claimed = 0 AND token_ciphertext IS NULL
    `).run(id, Date.now())).changes === 1
  }

  async bind(id: string, token: string): Promise<boolean> {
    const value = this.encryption().encrypt(token)
    return (await this.database().prepare(`
      UPDATE workshop_oauth_handshakes
      SET token_ciphertext = ?, token_nonce = ?, token_tag = ?, token_key_id = ?, callback_claimed = 1
      WHERE id = ? AND expires_at > ? AND token_ciphertext IS NULL
    `).run(value.ciphertext, value.nonce, value.tag, value.keyId, id, Date.now())).changes === 1
  }

  /** Atomic consumption also verifies the authenticated user before deleting. */
  async consume(id: string, userId: string): Promise<{ token: string; userId: string } | undefined> {
    const row = await this.database().prepare(`
      DELETE FROM workshop_oauth_handshakes
      WHERE id = ? AND user_id = ? AND expires_at > ? AND token_ciphertext IS NOT NULL
      RETURNING user_id, token_ciphertext, token_nonce, token_tag, token_key_id
    `).get<TokenRow>(id, userId, Date.now())
    return row && this.decode(row)
  }

  /** Read-only introspection; production proposal paths use consume. */
  async get(id: string): Promise<{ token: string; userId: string } | undefined> {
    const row = await this.database().prepare(`
      SELECT user_id, token_ciphertext, token_nonce, token_tag, token_key_id
      FROM workshop_oauth_handshakes WHERE id = ? AND expires_at > ? AND token_ciphertext IS NOT NULL
    `).get<TokenRow>(id, Date.now())
    return row && this.decode(row)
  }

  private decode(row: TokenRow) {
    return { userId: row.user_id, token: this.encryption().decrypt({
      ciphertext: row.token_ciphertext, nonce: row.token_nonce, tag: row.token_tag, keyId: row.token_key_id,
    }) }
  }

  async delete(id: string): Promise<void> {
    await this.database().prepare('DELETE FROM workshop_oauth_handshakes WHERE id = ?').run(id)
  }
}

export const tokenCache = new TokenCache()
