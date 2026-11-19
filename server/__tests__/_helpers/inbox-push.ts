import { randomUUID } from 'node:crypto'
import { BROWSER_AUTH_VERSION } from '../../../shared/contract/browser-auth'
import type { PostgresDatabase } from '../../database/postgres'
import { WebPushStore } from '../../web-push/store'

export async function createInboxPushLogin(
  db: PostgresDatabase,
  now: () => number,
  userId: string,
  kind: 'draft' | 'bug-report-inbox' = 'bug-report-inbox',
) {
  const token = randomUUID()
  const deviceId = randomUUID()
  const endpoint = `https://fcm.googleapis.com/fcm/send/${deviceId}`
  const store = new WebPushStore(db, now)
  await db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,auth_policy_version) VALUES(?,?,?,?,?)')
    .run(token, userId, now() + 2 * 86_400_000, now(), BROWSER_AUTH_VERSION)
  await store.bind(token, { deviceId, locale: 'en', kind, enabled: true,
    subscription: { endpoint, keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } } })
  return { endpoint, store, token }
}
