import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { canonicalJson } from '../shared/contract/authoritative-command'
import type { WorkshopPublicCardCatalog, WorkshopPublicCardCatalogEntry, WorkshopPublicCardInput, WorkshopPublicCardSnapshot, WorkshopPublicCardStatus } from '../shared/contract/workshop-public-cards'
import { cardArtKey } from '../shared/utils/card-art-url'
import type { PostgresDatabase } from './database/postgres'
import { corsHeaders } from './http-origin'
import { getResources } from './storage/runtime'
import { objectHash } from './storage/s3-store'

type VersionRow = { id: string; version_id: string; card_json: string; art_url: string | null }
type PublicationRow = VersionRow & {
  disabled_at: number | null
  live: number
  review_status: string
  approved_version_id: string | null
}

const currentPublicVersions = `FROM workshop_cards card
  JOIN workshop_card_versions version ON version.id=card.approved_version_id AND version.card_id=card.id
  JOIN workshop_public_versions publication ON publication.version_id=version.id AND publication.card_id=card.id
  WHERE card.live=1 AND card.review_status IN ('approved','merged') AND publication.disabled_at IS NULL`
const catalogPageSize = 20

function publicSource(row: Pick<VersionRow, 'id' | 'version_id'>): WorkshopPublicCardInput['source'] {
  return { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: row.id, versionId: row.version_id }
}

function catalogEntry(row: Pick<VersionRow, 'id' | 'version_id' | 'card_json'>): WorkshopPublicCardCatalogEntry {
  const card: unknown = JSON.parse(row.card_json)
  if (!card || typeof card !== 'object' || Array.isArray(card)
    || !('id' in card) || typeof card.id !== 'string' || !card.id
    || !('name' in card) || typeof card.name !== 'string' || !card.name
    || !('card_type' in card) || (card.card_type !== 'minor' && card.card_type !== 'occupation')) {
    throw new Error('Invalid public card display fields')
  }
  return { source: publicSource(row), cardId: card.id, name: card.name, cardType: card.card_type }
}

function loadPublication(db: PostgresDatabase, cardId: string, versionId: string) {
  return db.prepare(`SELECT card.id, version.id AS version_id, version.card_json, version.art_url,
      publication.disabled_at, card.live, card.review_status, card.approved_version_id
    FROM workshop_public_versions publication
    JOIN workshop_card_versions version ON version.id=publication.version_id AND version.card_id=publication.card_id
    JOIN workshop_cards card ON card.id=publication.card_id
    WHERE publication.card_id=? AND publication.version_id=?`).get<PublicationRow>(cardId, versionId)
}

async function snapshot(row: VersionRow): Promise<WorkshopPublicCardSnapshot> {
  const raw: unknown = JSON.parse(row.card_json)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid public card definition')
  const cardJson = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith('_')))
  const input: WorkshopPublicCardInput = {
    protocolVersion: 1,
    source: publicSource(row),
    cardJson,
    effectCode: '_code' in raw && typeof raw._code === 'string' ? raw._code : null,
    art: null,
  }
  if (row.art_url) {
    const key = cardArtKey(row.art_url)
    if (!key) throw new Error('Invalid public image identity')
    const image = await getResources().read(key)
    if (!image) throw new Error('Public image is unavailable')
    input.art = { sha256: objectHash(image.body), contentType: image.contentType, sizeBytes: image.body.length, base64: image.body.toString('base64') }
  }
  return { sha256: createHash('sha256').update(canonicalJson(input)).digest('hex'), input }
}

/** Strictly public reads; the caller's author identity never changes this source. */
export async function handleWorkshopPublicCards(req: IncomingMessage, res: ServerResponse, db: PostgresDatabase): Promise<boolean> {
  const url = new URL(req.url ?? '', 'http://localhost')
  if (!url.pathname.startsWith('/api/workshop/public-cards/')) return false
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders({ methods: 'GET,OPTIONS' }) })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'GET') { send(405, { ok: false, code: 'read_only' }); return true }
  if (url.pathname === '/api/workshop/public-cards/v1/cards') {
    const after = url.searchParams.get('after')
    if (url.search && (after === null || url.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(after))) {
      send(400, { ok: false, code: 'invalid_public_card_request', protocolVersion: 1 }); return true
    }
    try {
      const rows = await db.prepare(`SELECT card.id, version.id AS version_id, version.card_json
        ${currentPublicVersions} AND card.id COLLATE "C">? ORDER BY card.id COLLATE "C" LIMIT ?`)
        .all<Pick<VersionRow, 'id' | 'version_id' | 'card_json'>>(after ?? '', catalogPageSize + 1)
      const cards = rows.slice(0, catalogPageSize).map(catalogEntry)
      const last = cards.at(-1)
      const catalog: WorkshopPublicCardCatalog = {
        protocolVersion: 1, cards,
        nextCursor: rows.length > catalogPageSize && last ? last.source.workshopCardId : null,
      }
      send(200, { ok: true, ...catalog })
    } catch { send(503, { ok: false, code: 'public_card_source_unavailable' }) }
    return true
  }
  const match = /^\/api\/workshop\/public-cards\/v1\/cards\/([A-Za-z0-9_-]+)(?:\/versions\/([A-Za-z0-9_-]+)\/status)?$/.exec(url.pathname)
  const requestedHash = url.searchParams.get('sha256')
  if (!match || (match[2] ? !requestedHash || !/^[a-f0-9]{64}$/.test(requestedHash) || url.searchParams.size !== 1 : Boolean(url.search))) {
    send(400, { ok: false, code: 'invalid_public_card_request', protocolVersion: 1 }); return true
  }
  const checkedAt = Date.now()
  try {
    if (match[2] && requestedHash) {
      let row = await loadPublication(db, match[1], match[2])
      let matchingInput = false
      if (row && row.disabled_at === null) {
        matchingInput = (await snapshot(row)).sha256 === requestedHash
        // Network image reads must not conceal an already committed disable.
        row = await loadPublication(db, match[1], match[2])
      }
      let access: WorkshopPublicCardStatus['access']
      if (!row) access = { kind: 'not_public', allowNew: false, allowExisting: false }
      else if (row.disabled_at !== null) access = { kind: 'disabled', allowNew: false, allowExisting: false }
      else if (!matchingInput) access = { kind: 'content_mismatch', allowNew: false, allowExisting: false }
      else if (!row.live || !row.approved_version_id || !['approved', 'merged'].includes(row.review_status)) access = { kind: 'offline', allowNew: false, allowExisting: true }
      else if (row.approved_version_id !== row.version_id) access = { kind: 'superseded', allowNew: false, allowExisting: true }
      else access = { kind: 'current', allowNew: true, allowExisting: true }
      const validUntil = checkedAt + 30_000
      if (Date.now() >= validUntil) throw new Error('Public source read expired')
      const status: WorkshopPublicCardStatus = { protocolVersion: 1, sha256: requestedHash, checkedAt, validUntil, access }
      send(200, { ok: true, ...status })
      return true
    }
    const row = await db.prepare(`SELECT card.id, version.id AS version_id, version.card_json, version.art_url
      ${currentPublicVersions} AND card.id=?`).get<VersionRow>(match[1])
    if (!row) { send(404, { ok: false, code: 'public_card_unavailable' }); return true }
    const publicSnapshot = await snapshot(row)
    const current = await loadPublication(db, row.id, row.version_id)
    if (!current || current.disabled_at !== null || !current.live || current.approved_version_id !== row.version_id || !['approved', 'merged'].includes(current.review_status)) {
      send(409, { ok: false, code: 'public_card_changed' }); return true
    }
    const validUntil = checkedAt + 30_000
    if (Date.now() >= validUntil) throw new Error('Public source read expired')
    const status: WorkshopPublicCardStatus = { protocolVersion: 1, sha256: publicSnapshot.sha256, checkedAt, validUntil, access: { kind: 'current', allowNew: true, allowExisting: true } }
    send(200, { ok: true, snapshot: publicSnapshot, status })
  } catch {
    send(503, { ok: false, code: 'public_card_source_unavailable' })
  }
  return true
}
