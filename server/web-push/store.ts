import { randomUUID } from 'node:crypto'
import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import {
  emptyWebPushPreferences,
  type BrowserPushSubscription, type WebPushKind, type WebPushPreferences, type WebPushTarget,
} from '../../shared/contract/web-push'
import { getSessionByToken } from '../auth'
import type { PostgresDatabase } from '../database/postgres'
import { RoomHistoryStore } from '../game/persistence/room-history-store'
import { draftPushOpportunity } from './draft'

const HOUR_MS = 60 * 60 * 1_000
const CLAIM_MS = 30_000
const DEVICES_PER_LOGIN = 8

type DraftPushEvent = { kind: 'draft'; userId: string; roomId: string; seat: number; opportunityKey: string; stepNo: number; createdAt: number }
export type WebPushEvent = DraftPushEvent | { kind: 'bug-report-inbox'; userId: string; messageId: number; createdAt: number }
type BoundDevice = { id: string; endpoint: string; draft_enabled: boolean; inbox_enabled: boolean }
type DeviceOptions = {
  deviceId: string
  expectedUserId?: string
  kind: WebPushKind
  enabled: boolean
  locale: string
  subscription: BrowserPushSubscription | null
}
type DeliveryClaim = { deliveryId: string; claimToken: string; attempts: number }
type DeliveryRow = {
  user_id: string
  kind: WebPushKind
  room_id: string | null
  seat: number | null
  opportunity_key: string | null
  inbox_id: number | null
  binding_id: string
  expires_at: number
  endpoint: string
  p256dh: string
  auth_secret: string
  locale: string
}
export type PushDelivery = {
  deliveryId: string
  kind: WebPushKind
  bindingId: string
  locale: string
  expiresAt: number
  subscription: BrowserPushSubscription
}

const preference = (device?: BoundDevice): WebPushPreferences =>
  device ? { draft: device.draft_enabled, 'bug-report-inbox': device.inbox_enabled } : emptyWebPushPreferences()

/** Use the producer's database transaction to snapshot the opted-in bindings at event creation. */
export async function enqueueWebPush(db: PostgresDatabase, event: WebPushEvent): Promise<void> {
  const draft = event.kind === 'draft' ? event : undefined
  const inboxId = event.kind === 'bug-report-inbox' ? event.messageId : null
  const sourceKey = draft ? `${draft.roomId}:${draft.seat}:${draft.stepNo}` : String(inboxId)
  // Account deletion locks the User before cascading through sessions and bindings.
  if (!await db.prepare('SELECT id FROM users WHERE id=? FOR KEY SHARE').get(event.userId)) return
  await db.prepare(`
    WITH eligible AS (
      SELECT b.id FROM web_push_bindings b JOIN sessions s ON s.token=b.session_token AND s.user_id=b.user_id
      WHERE b.user_id=@userId AND s.expires_at>@createdAt AND s.auth_policy_version=@authVersion
        AND CASE WHEN @kind='draft' THEN b.draft_enabled ELSE b.inbox_enabled END
        AND NOT EXISTS (SELECT 1 FROM account_deletion_requests a WHERE a.user_id=b.user_id)
      FOR KEY SHARE OF b
    ), inserted AS (
      INSERT INTO web_push_events(id,kind,source_key,user_id,room_id,seat,opportunity_key,inbox_id,created_at,expires_at)
      SELECT @id,@kind,@sourceKey,@userId,@roomId,@seat,@opportunityKey,@inboxId,@createdAt,@expiresAt
      WHERE EXISTS (SELECT 1 FROM eligible)
      ON CONFLICT (kind,source_key) DO NOTHING RETURNING id
    )
    INSERT INTO web_push_deliveries(event_id,binding_id,next_attempt_at)
    SELECT inserted.id,eligible.id,@createdAt FROM inserted CROSS JOIN eligible
  `).run({
    id: randomUUID(), kind: event.kind, sourceKey, userId: event.userId, roomId: draft?.roomId ?? null,
    seat: draft?.seat ?? null, opportunityKey: draft?.opportunityKey ?? null, inboxId, createdAt: event.createdAt,
    expiresAt: event.createdAt + (draft ? HOUR_MS : HOUR_MS * 24), authVersion: BROWSER_AUTH_VERSION,
  })
}

export class WebPushStore {
  private readonly history: RoomHistoryStore
  private readonly db: PostgresDatabase
  private readonly now: () => number

  constructor(db: PostgresDatabase, now = Date.now) {
    this.db = db
    this.now = now
    this.history = new RoomHistoryStore(db)
  }

  /** deviceId is a random browser-local unbind capability. Never return or log it. */
  async unbind(deviceId: string) {
    await this.db.transaction(async () => {
      await this.lockDevice(deviceId)
      await this.db.prepare(`
        WITH revoked_binding AS (DELETE FROM web_push_bindings WHERE device_id=@deviceId RETURNING device_id),
          revoked_reservation AS (DELETE FROM web_push_device_reservations WHERE device_id=@deviceId RETURNING device_id)
        INSERT INTO web_push_retired_devices(device_id,retired_at)
        SELECT device_id,@now::bigint FROM revoked_binding UNION SELECT device_id,@now::bigint FROM revoked_reservation
        ON CONFLICT DO NOTHING
      `).run({ deviceId, now: this.now() })
    })()
  }

  async preferences(sessionToken: string, deviceId: string, endpoint: string | null, expectedUserId?: string, canReserve = true) {
    return this.db.transaction(async () => {
      const session = await getSessionByToken(sessionToken, { db: this.db, now: this.now(), lock: 'update' })
      if (!session || (expectedUserId !== undefined && session.user.id !== expectedUserId)) return null
      await this.lockDevice(deviceId)
      await this.db.prepare(`DELETE FROM web_push_bindings WHERE device_id=?
        AND (session_token<>? OR endpoint IS DISTINCT FROM ?)`).run(deviceId, sessionToken, endpoint)
      const binding = await this.binding(sessionToken, deviceId)
      if (canReserve && !await this.isRetired(deviceId)) {
        // Reserve the capability under an authenticated login before opening the browser permission prompt.
        const reservation = await this.db.prepare(`
          INSERT INTO web_push_device_reservations(session_token,device_id)
          SELECT @sessionToken,@deviceId
          WHERE EXISTS (SELECT 1 FROM web_push_device_reservations WHERE session_token=@sessionToken AND device_id=@deviceId)
            OR (SELECT count(*) FROM web_push_device_reservations WHERE session_token=@sessionToken) < @limit
          ON CONFLICT(device_id) DO UPDATE SET session_token=excluded.session_token
        `).run({ sessionToken, deviceId, limit: DEVICES_PER_LOGIN })
        if (!binding && reservation.changes !== 1) return null
      }
      return preference(binding)
    })()
  }

  async bind(sessionToken: string, options: DeviceOptions) {
    return this.db.transaction(async () => {
      const currentSession = await getSessionByToken(sessionToken, { db: this.db, now: this.now() })
      if (!currentSession || (options.expectedUserId !== undefined && currentSession.user.id !== options.expectedUserId)) return null
      if (!await this.db.prepare('SELECT id FROM users WHERE id=? FOR KEY SHARE').get(currentSession.user.id)) return null
      const session = await getSessionByToken(sessionToken, { db: this.db, now: this.now(), lock: 'share' })
      if (!session || session.user.id !== currentSession.user.id) return null
      await this.lockDevice(options.deviceId)
      if (await this.isRetired(options.deviceId)) return null
      const endpoint = options.subscription?.endpoint ?? null
      const keys = options.subscription?.keys
      await this.db.prepare(`DELETE FROM web_push_bindings WHERE device_id=?
        AND (session_token<>? OR endpoint IS DISTINCT FROM ?)`).run(options.deviceId, sessionToken, endpoint)
      const current = await this.binding(sessionToken, options.deviceId)
      if (!current && (!options.enabled || !endpoint || !keys)) return emptyWebPushPreferences()
      if (!current && endpoint && keys) {
        if (!await this.db.prepare('SELECT 1 FROM web_push_device_reservations WHERE session_token=? AND device_id=?')
          .get(sessionToken, options.deviceId)) return null
        // A live endpoint may only belong to one browser device binding. An
        // endpoint owned by a different device cannot be moved by a preference write.
        const inserted = await this.db.prepare(`
          INSERT INTO web_push_bindings(id,device_id,endpoint,p256dh,auth_secret,user_id,session_token,locale,draft_enabled,inbox_enabled)
          VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO NOTHING
        `).run(randomUUID(), options.deviceId, endpoint, keys.p256dh, keys.auth, session.user.id,
          sessionToken, options.locale, options.kind === 'draft', options.kind === 'bug-report-inbox')
        return inserted.changes === 1 ? preference(await this.binding(sessionToken, options.deviceId)) : null
      }
      const updated = await this.db.prepare(`
        UPDATE web_push_bindings SET locale=@locale,
          draft_enabled=CASE WHEN @kind='draft' THEN @enabled ELSE draft_enabled END,
          inbox_enabled=CASE WHEN @kind='bug-report-inbox' THEN @enabled ELSE inbox_enabled END
        WHERE device_id=@deviceId AND session_token=@sessionToken
        RETURNING id,endpoint,draft_enabled,inbox_enabled
      `).get<BoundDevice>({ ...options, sessionToken })
      if (updated && !updated.draft_enabled && !updated.inbox_enabled) {
        await this.db.prepare('DELETE FROM web_push_bindings WHERE id=?').run(updated.id)
      } else {
        await this.db.prepare(`
          UPDATE web_push_deliveries d SET status='discarded',claim_token=NULL
          FROM web_push_events e
          WHERE d.event_id=e.id AND d.binding_id=? AND e.kind=? AND NOT ? AND d.status='pending'
        `).run(updated?.id ?? null, options.kind, options.enabled)
      }
      return preference(updated)
    })()
  }

  private isRetired(deviceId: string) {
    return this.db.prepare('SELECT 1 FROM web_push_retired_devices WHERE device_id=?').get(deviceId)
  }

  private lockDevice(deviceId: string) {
    return this.db.prepare('SELECT pg_advisory_xact_lock(1836,hashtext(?))').get(deviceId)
  }

  private binding(token: string, deviceId: string) {
    return this.db.prepare(`SELECT id,endpoint,draft_enabled,inbox_enabled FROM web_push_bindings
      WHERE device_id=? AND session_token=?`).get<BoundDevice>(deviceId, token)
  }

  async claimDue(kinds: readonly WebPushKind[]): Promise<DeliveryClaim | null> {
    if (!kinds.length) return null
    const now = this.now()
    const claimToken = randomUUID()
    const row = await this.db.prepare(`
      WITH due AS (
        SELECT d.id FROM web_push_deliveries d JOIN web_push_events e ON e.id=d.event_id
        WHERE d.status='pending' AND d.binding_id IS NOT NULL AND d.next_attempt_at<=@now AND d.claim_until<=@now
          AND e.expires_at>@now AND e.kind=ANY(@kinds::text[])
        ORDER BY d.next_attempt_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
      )
      UPDATE web_push_deliveries d SET claim_token=@token,claim_until=@until,attempts=d.attempts+1
      FROM due WHERE d.id=due.id RETURNING d.id AS "deliveryId",d.attempts
    `).get<{ deliveryId: string; attempts: number }>({ now, kinds, token: claimToken, until: now + CLAIM_MS })
    return row ? { ...row, claimToken } : null
  }

  async attempt(claim: DeliveryClaim): Promise<PushDelivery | null> {
    const now = this.now()
    const row = await this.db.prepare(`
      SELECT e.user_id,e.kind,e.room_id,e.seat,e.opportunity_key,e.inbox_id,e.expires_at,
        b.id AS binding_id,b.endpoint,b.p256dh,b.auth_secret,b.locale
      FROM web_push_deliveries d JOIN web_push_events e ON e.id=d.event_id
      JOIN web_push_bindings b ON b.id=d.binding_id AND b.user_id=e.user_id
      JOIN sessions s ON s.token=b.session_token AND s.user_id=b.user_id
      WHERE d.id=@deliveryId AND d.claim_token=@token AND d.status='pending'
        AND e.expires_at>@now AND s.expires_at>@now AND s.auth_policy_version=@authVersion
        AND CASE WHEN e.kind='draft' THEN b.draft_enabled ELSE b.inbox_enabled END
        AND NOT EXISTS (SELECT 1 FROM account_deletion_requests a WHERE a.user_id=b.user_id)
    `).get<DeliveryRow>({ deliveryId: claim.deliveryId, token: claim.claimToken, now, authVersion: BROWSER_AUTH_VERSION })
    if (!row) return null
    const eligible = row.kind === 'draft'
      ? row.room_id && row.seat !== null && row.opportunity_key !== null
        && await this.draftOpportunity(row.user_id, row.room_id, row.seat) === row.opportunity_key
      : row.inbox_id !== null && await this.hasInbox(row.user_id, row.inbox_id, true)
    if (!eligible) return null
    return {
      deliveryId: claim.deliveryId, kind: row.kind, bindingId: row.binding_id, locale: row.locale, expiresAt: row.expires_at,
      subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } },
    }
  }

  async settle(claim: DeliveryClaim, result: 'accepted' | 'discarded' | { retryAt: number }) {
    await this.db.prepare(`
      UPDATE web_push_deliveries SET status=?,next_attempt_at=?,claim_token=NULL,claim_until=0
      WHERE id=? AND claim_token=?
    `).run(typeof result === 'string' ? result : 'pending',
      typeof result === 'string' ? 0 : result.retryAt, claim.deliveryId, claim.claimToken)
  }

  async discardUnavailableDeliveries() {
    const now = this.now()
    await this.db.prepare('DELETE FROM web_push_retired_devices WHERE retired_at<?').run(now - HOUR_MS)
    await this.db.prepare(`
      UPDATE web_push_deliveries d SET status='discarded',claim_token=NULL,claim_until=0
      FROM web_push_events e WHERE d.event_id=e.id AND d.status='pending'
        AND (d.binding_id IS NULL OR e.expires_at<=?)
    `).run(now)
  }

  async expireBinding(bindingId: string) {
    await this.db.prepare('DELETE FROM web_push_bindings WHERE id=?').run(bindingId)
  }

  async resolveClick(sessionToken: string, deliveryId: string, kind: WebPushKind, expectedUserId?: string): Promise<WebPushTarget> {
    const row = await this.db.prepare(`
      SELECT e.user_id,e.kind,e.room_id,e.seat,e.opportunity_key,e.inbox_id
      FROM web_push_deliveries d JOIN web_push_events e ON e.id=d.event_id
      JOIN sessions s ON s.user_id=e.user_id
      WHERE d.id=? AND e.kind=? AND s.token=? AND s.expires_at>? AND s.auth_policy_version=?
        AND NOT EXISTS (SELECT 1 FROM account_deletion_requests a WHERE a.user_id=e.user_id)
    `).get<Pick<DeliveryRow, 'user_id' | 'kind' | 'room_id' | 'seat' | 'opportunity_key' | 'inbox_id'>>(
      deliveryId, kind, sessionToken, this.now(), BROWSER_AUTH_VERSION,
    )
    if (!row || (expectedUserId !== undefined && row.user_id !== expectedUserId)) return { kind: 'unavailable' }
    if (row.kind === 'draft' && row.room_id && row.seat !== null && await this.draftOpportunity(row.user_id, row.room_id, row.seat)) {
      return { kind: 'draft', roomId: row.room_id }
    }
    if (row.kind === 'bug-report-inbox' && row.inbox_id !== null && await this.hasInbox(row.user_id, row.inbox_id, false)) {
      return { kind: 'bug-report-inbox', messageId: row.inbox_id }
    }
    return { kind: 'unavailable' }
  }

  private async hasInbox(userId: string, messageId: number, unread: boolean) {
    return !!await this.db.prepare(`SELECT 1 FROM bug_report_feedback WHERE id=? AND recipient_user_id=?
      AND kind IN ('needs_info','fix_released') AND (NOT ? OR read_at IS NULL)`).get(messageId, userId, unread)
  }

  private async draftOpportunity(userId: string, roomId: string, seat: number): Promise<string | null> {
    const row = await this.db.prepare(`
      SELECT r.state_json FROM rooms r JOIN game_contexts c ON c.room_id=r.id
      JOIN room_players p ON p.room_id=r.id
      WHERE r.id=? AND r.status='playing' AND r.hotseat=0 AND c.lifecycle='active'
        AND (c.expires_at IS NULL OR c.expires_at>?) AND p.user_id=? AND p.player_index=?
    `).get<{ state_json: string | null }>(roomId, this.now(), userId, seat)
    if (!row?.state_json) return null
    const { state } = await this.history.restore(roomId, row.state_json)
    return draftPushOpportunity(state, seat)
  }
}
