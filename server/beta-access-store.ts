import type { BetaAccessGrant } from '../shared/contract/beta-access'
import { isAdmin } from './auth'
import type { PostgresDatabase } from './database/postgres'

export class BetaAccessStore {
  private readonly db: PostgresDatabase
  constructor(db: PostgresDatabase) { this.db = db }

  async hasAccess(userId: string): Promise<boolean> {
    const account = await this.db.prepare(`SELECT u.username, b.user_id IS NOT NULL AS beta_access
      FROM users u LEFT JOIN beta_access b ON b.user_id=u.id WHERE u.id=?`)
      .get<{ username: string; beta_access: boolean }>(userId)
    return !!account && (isAdmin(account.username) || account.beta_access)
  }

  async list(): Promise<BetaAccessGrant[]> {
    const rows = await this.db.prepare(`SELECT u.id, u.username, u.display_name, b.granted_at,
      a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_display_name
      FROM beta_access b JOIN users u ON u.id=b.user_id LEFT JOIN users a ON a.id=b.granted_by
      ORDER BY b.granted_at DESC, u.username`).all<{
        id: string; username: string; display_name: string; granted_at: number
        actor_id: string | null; actor_username: string | null; actor_display_name: string | null
      }>()
    return rows.map(row => ({
      account: { id: row.id, username: row.username, displayName: row.display_name },
      grantedBy: row.actor_id !== null && row.actor_username !== null && row.actor_display_name !== null
        ? { id: row.actor_id, username: row.actor_username, displayName: row.actor_display_name } : null,
      grantedAt: row.granted_at,
    }))
  }

  async grant(userId: string, actorId: string): Promise<boolean> {
    return this.db.transaction(async () => {
      const account = await this.db.prepare('SELECT username FROM users WHERE id=? FOR KEY SHARE').get<{ username: string }>(userId)
      if (!account) return false
      if (!isAdmin(account.username)) {
        await this.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING')
          .run(userId, actorId, Date.now())
      }
      return true
    })()
  }

  async revoke(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM beta_access WHERE user_id=?').run(userId)
  }
}
