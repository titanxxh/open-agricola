import type { IncomingMessage, ServerResponse } from 'node:http'
import { getDb } from './db.ts'
import { validateSession, extractToken, isAdmin } from './auth.ts'
import { nanoid } from 'nanoid'
import { validateAndCompileCustomCodeRemote } from './custom-code/client.ts'
import type { CustomCodeValidateResult } from '../shared/custom-code/types.ts'
import { handleOAuthStart, handleOAuthCallback } from './workshop-pr/oauth-handler.ts'
import { handleProposeRequest, handleRefreshPrStatus } from './workshop-pr/propose-handler.ts'

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(payload))
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })

const parseBody = async <T>(req: IncomingMessage): Promise<T | null> => {
  try { return JSON.parse(await readBody(req)) as T } catch { return null }
}

type WorkshopCard = {
  id: string
  author_id: string
  author_name?: string
  card_id: string
  card_type: string
  name: string
  description: string
  card_json: string
  effect_code?: string | null
  compiled_code?: string | null
  code_manifest?: string | null
  art_url: string | null
  status: string
  like_count?: number
  liked_by_me?: boolean
  created_at: number
  updated_at: number
}

type SandboxSettings = {
  player_count: number
  deck_ids: string[]
  updated_at?: number
}

const SANDBOX_DECK_IDS = ['A', 'B', 'C', 'D', 'E'] as const

const sanitizeSandboxPlayerCount = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 2
  return Math.min(4, Math.max(2, Math.floor(parsed)))
}

const sanitizeSandboxDeckIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [...SANDBOX_DECK_IDS]
  const next = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is typeof SANDBOX_DECK_IDS[number] =>
      (SANDBOX_DECK_IDS as readonly string[]).includes(item),
    )
  return next.length > 0 ? Array.from(new Set(next)) : [...SANDBOX_DECK_IDS]
}

const getSandboxSettings = (userId: string): SandboxSettings => {
  const db = getDb()
  const row = db.prepare(`
    SELECT player_count, deck_ids_json, updated_at
    FROM sandbox_settings
    WHERE user_id = ?
  `).get(userId) as { player_count: number; deck_ids_json: string; updated_at: number } | undefined
  if (!row) {
    return {
      player_count: 2,
      deck_ids: [...SANDBOX_DECK_IDS],
    }
  }
  let rawDeckIds: unknown = []
  try {
    rawDeckIds = JSON.parse(row.deck_ids_json)
  } catch {
    rawDeckIds = []
  }
  return {
    player_count: sanitizeSandboxPlayerCount(row.player_count),
    deck_ids: sanitizeSandboxDeckIds(rawDeckIds),
    updated_at: row.updated_at,
  }
}

const saveSandboxSettings = (userId: string, settings?: { player_count?: unknown; deck_ids?: unknown }): SandboxSettings => {
  const next: SandboxSettings = {
    player_count: sanitizeSandboxPlayerCount(settings?.player_count),
    deck_ids: sanitizeSandboxDeckIds(settings?.deck_ids),
    updated_at: Date.now(),
  }
  const db = getDb()
  db.prepare(`
    INSERT INTO sandbox_settings (user_id, player_count, deck_ids_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      player_count = excluded.player_count,
      deck_ids_json = excluded.deck_ids_json,
      updated_at = excluded.updated_at
  `).run(userId, next.player_count, JSON.stringify(next.deck_ids), next.updated_at)
  return next
}

/** Route handler — returns true if handled. */
export async function handleWorkshopRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url ?? ''
  if (!url.startsWith('/api/workshop/') && !url.startsWith('/api/admin/')) return false

  const token = extractToken(req.headers.authorization)
  const user = validateSession(token)
  const db = getDb()

  // ── GET /api/workshop/github/oauth/start ────────────────────────────────
  // Redirects to GitHub's authorize URL. Handshake must already be pending.
  if (req.method === 'GET' && url.startsWith('/api/workshop/github/oauth/start')) {
    handleOAuthStart(req, res, new URL(url, 'http://localhost'))
    return true
  }

  // ── GET /api/workshop/github/oauth/callback ─────────────────────────────
  // GitHub redirects here with ?code=&state=. Exchanges code for access token.
  if (req.method === 'GET' && url.startsWith('/api/workshop/github/oauth/callback')) {
    await handleOAuthCallback(req, res, new URL(url, 'http://localhost'))
    return true
  }

  // ── POST /api/workshop/cards/:id/propose ────────────────────────────────
  // Opens or updates a GitHub PR against upstream from the author's fork.
  const proposeMatch = /^\/api\/workshop\/cards\/([^/]+)\/propose$/.exec(url)
  if (req.method === 'POST' && proposeMatch) {
    await handleProposeRequest(req, res, proposeMatch[1]!)
    return true
  }

  // ── POST /api/workshop/cards/:id/refresh-pr-status ──────────────────────
  // Queries GitHub (anonymously) to sync cached PR state.
  const refreshMatch = /^\/api\/workshop\/cards\/([^/]+)\/refresh-pr-status$/.exec(url)
  if (req.method === 'POST' && refreshMatch) {
    await handleRefreshPrStatus(req, res, refreshMatch[1]!)
    return true
  }

  // ── GET /api/workshop/cards ─────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/workshop/cards') && !url.includes('/comments') && !url.includes('/like')) {
    const q = new URL(url, 'http://localhost').searchParams
    const sort = q.get('sort') === 'popular' ? 'popular' : 'recent'
    const search = q.get('search')?.trim() ?? ''
    const page = Math.max(1, Number(q.get('page') ?? '1'))
    const limit = 20
    const offset = (page - 1) * limit
    const statusFilter = q.get('status')
    const mineOnly = q.get('scope') === 'mine'
    const featured = q.get('featured') === '1'

    let whereExtra = ''
    const params: unknown[] = []

    if (mineOnly) {
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Not authenticated' })
        return true
      }
      whereExtra += ' AND w.author_id = ?'
      params.push(user.id)
      if (statusFilter === 'draft' || statusFilter === 'published') {
        whereExtra += ' AND w.status = ?'
        params.push(statusFilter)
      }
    } else {
      // Only admins/authors can see non-published cards; enforce published for public
      const effectiveStatus = user ? (statusFilter === 'draft' ? 'draft' : 'published') : 'published'
      whereExtra += ' AND w.status = ?'
      params.push(effectiveStatus)
      if (effectiveStatus === 'draft' && user) {
        whereExtra += ' AND w.author_id = ?'
        params.push(user.id)
      }
    }

    if (featured) {
      whereExtra += ' AND w.featured = 1'
    }

    if (search) {
      whereExtra += ' AND (w.name LIKE ? OR w.description LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    const orderBy = sort === 'popular'
      ? 'w.featured DESC, like_count DESC, w.updated_at DESC'
      : 'w.updated_at DESC'

    const rows = db.prepare(`
      SELECT w.*,
             u.display_name AS author_name,
             COUNT(DISTINCT l.user_id) AS like_count
      FROM workshop_cards w
      LEFT JOIN users u ON w.author_id = u.id
      LEFT JOIN card_likes l ON l.card_id = w.id
      WHERE 1 = 1${whereExtra}
      GROUP BY w.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as WorkshopCard[]

    // Mark liked by current user
    let likedIds = new Set<string>()
    if (user && rows.length > 0) {
      const ids = rows.map(r => r.id)
      const liked = db.prepare(
        `SELECT card_id FROM card_likes WHERE user_id = ? AND card_id IN (${ids.map(() => '?').join(',')})`,
      ).all(user.id, ...ids) as { card_id: string }[]
      likedIds = new Set(liked.map(r => r.card_id))
    }

    const cards = rows.map(r => ({
      ...r,
      card_json: JSON.parse(r.card_json as string),
      liked_by_me: likedIds.has(r.id),
    }))

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM workshop_cards w WHERE 1 = 1${whereExtra}`)
      .get(...params) as { n: number }).n

    sendJson(res, 200, { ok: true, cards, page, total, hasMore: offset + rows.length < total })
    return true
  }

  // ── GET /api/workshop/cards/:id ─────────────────────────────────────────
  const cardDetailMatch = /^\/api\/workshop\/cards\/([^/]+)$/.exec(url)
  if (req.method === 'GET' && cardDetailMatch) {
    const cardDbId = cardDetailMatch[1]!
    const row = db.prepare(`
      SELECT w.*, u.display_name AS author_name,
             COUNT(DISTINCT l.user_id) AS like_count
      FROM workshop_cards w
      LEFT JOIN users u ON w.author_id = u.id
      LEFT JOIN card_likes l ON l.card_id = w.id
      WHERE w.id = ?
      GROUP BY w.id
    `).get(cardDbId) as WorkshopCard | undefined

    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    if (row.status === 'draft' && row.author_id !== user?.id) {
      sendJson(res, 404, { ok: false, error: 'Card not found' }); return true
    }

    const likedByMe = user
      ? !!(db.prepare('SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?').get(user.id, row.id))
      : false

    sendJson(res, 200, {
      ok: true,
      card: {
        ...row,
        card_json: JSON.parse(row.card_json as string),
        liked_by_me: likedByMe,
      },
    })
    return true
  }

  // ── POST /api/workshop/cards/validate-code ──────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/cards/validate-code') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ source?: string }>(req)
    if (!body?.source || typeof body.source !== 'string') {
      sendJson(res, 400, { ok: false, error: 'Missing source' }); return true
    }
    let result: CustomCodeValidateResult
    try {
      result = await validateAndCompileCustomCodeRemote(body.source, 'CUSTOM_ValidateOnly')
    } catch (error) {
      sendJson(res, 502, { ok: false, error: `Executor unavailable: ${error instanceof Error ? error.message : String(error)}` })
      return true
    }
    if (result.valid) {
      sendJson(res, 200, { ok: true, valid: true, compiled: result.compiledCode, manifest: result.manifest })
    } else {
      sendJson(res, 200, { ok: true, valid: false, errors: result.errors })
    }
    return true
  }

  // ── POST /api/workshop/cards ─────────────────────────────────────────────
  // Create or update a card (auth required)
  if (req.method === 'POST' && url === '/api/workshop/cards') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      id?: string
      card_id?: string
      card_type?: string
      name?: string
      description?: string
      card_json?: unknown
      effect_code?: string
      art_url?: string
      status?: string
    }>(req)
    if (!body?.card_id || !body.card_type || !body.name || !body.card_json) {
      sendJson(res, 400, { ok: false, error: 'Missing required fields: card_id, card_type, name, card_json' })
      return true
    }
    if (!body.card_id.startsWith('CUSTOM_')) {
      sendJson(res, 400, { ok: false, error: 'card_id must start with CUSTOM_' })
      return true
    }
    if (!['minor', 'occupation'].includes(body.card_type)) {
      sendJson(res, 400, { ok: false, error: 'card_type must be minor or occupation' })
      return true
    }

    // Validate + compile effect_code if provided
    let effectCode: string | null = null
    let compiledCode: string | null = null
    let codeManifest: string | null = null
    if (body.effect_code && typeof body.effect_code === 'string' && body.effect_code.trim()) {
      let validation: CustomCodeValidateResult
      try {
        validation = await validateAndCompileCustomCodeRemote(body.effect_code, body.card_id)
      } catch (error) {
        sendJson(res, 502, { ok: false, error: `Executor unavailable: ${error instanceof Error ? error.message : String(error)}` })
        return true
      }
      if (!validation.valid) {
        sendJson(res, 400, { ok: false, error: 'Code validation failed', errors: validation.errors })
        return true
      }
      effectCode = body.effect_code
      compiledCode = validation.compiledCode
      codeManifest = JSON.stringify(validation.manifest)
    }

    const newStatus = body.status === 'published' ? 'published' : 'draft'
    const now = Date.now()

    // If publishing, check uniqueness
    if (newStatus === 'published') {
      const conflict = db.prepare(
        "SELECT id FROM workshop_cards WHERE card_id = ? AND status = 'published' AND id != ?",
      ).get(body.card_id, body.id ?? '') as { id: string } | undefined
      if (conflict) {
        sendJson(res, 409, { ok: false, error: 'A published card with this card_id already exists' })
        return true
      }
    }

    // Auto-resolve: if no body.id but a draft with this card_id exists for this author, update it
    if (!body.id && body.card_id) {
      const existingDraft = db.prepare(
        'SELECT id FROM workshop_cards WHERE card_id = ? AND author_id = ? LIMIT 1',
      ).get(body.card_id, user.id) as { id: string } | undefined
      if (existingDraft) {
        body.id = existingDraft.id
      }
    }

    if (body.id) {
      // Update existing
      const existing = db.prepare('SELECT * FROM workshop_cards WHERE id = ?').get(body.id) as
        | WorkshopCard | undefined
      if (!existing) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
      if (existing.author_id !== user.id) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }

      // Save version snapshot before update
      const versionNum = ((db.prepare(
        'SELECT COALESCE(MAX(version_number), 0) AS n FROM workshop_card_versions WHERE card_id = ?',
      ).get(body.id) as { n: number })?.n ?? 0) + 1
      db.prepare(`
        INSERT INTO workshop_card_versions (id, card_id, card_json, effect_code, compiled_code, code_manifest, art_url, version_number, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nanoid(), body.id, existing.card_json,
        existing.effect_code ?? null, existing.compiled_code ?? null, existing.code_manifest ?? null,
        existing.art_url ?? null, versionNum, user.id, now,
      )

      db.prepare(`
        UPDATE workshop_cards SET
          card_id = ?, card_type = ?, name = ?, description = ?,
          card_json = ?, effect_code = ?, compiled_code = ?, code_manifest = ?,
          art_url = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        body.card_id, body.card_type, body.name, body.description ?? '',
        JSON.stringify(body.card_json),
        effectCode, compiledCode, codeManifest,
        body.art_url ?? null, newStatus, now, body.id,
      )

      sendJson(res, 200, { ok: true, id: body.id })
    } else {
      // Create new
      const id = nanoid()
      db.prepare(`
        INSERT INTO workshop_cards
          (id, author_id, card_id, card_type, name, description, card_json, effect_code, compiled_code, code_manifest, art_url, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, user.id, body.card_id, body.card_type, body.name, body.description ?? '',
        JSON.stringify(body.card_json),
        effectCode, compiledCode, codeManifest,
        body.art_url ?? null, newStatus, now, now,
      )

      sendJson(res, 200, { ok: true, id })
    }
    return true
  }

  // ── DELETE /api/workshop/cards/:id ──────────────────────────────────────
  const cardDeleteMatch = /^\/api\/workshop\/cards\/([^/]+)$/.exec(url)
  if (req.method === 'DELETE' && cardDeleteMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = cardDeleteMatch[1]!
    const row = db.prepare('SELECT author_id FROM workshop_cards WHERE id = ?').get(cardDbId) as
      | { author_id: string } | undefined
    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    if (row.author_id !== user.id && !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }
    db.prepare('DELETE FROM workshop_cards WHERE id = ?').run(cardDbId)
    sendJson(res, 200, { ok: true })
    return true
  }

  // ── POST /api/workshop/cards/:id/like ────────────────────────────────────
  const likeMatch = /^\/api\/workshop\/cards\/([^/]+)\/like$/.exec(url)
  if (req.method === 'POST' && likeMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = likeMatch[1]!
    const cardRow = db.prepare('SELECT status, author_id FROM workshop_cards WHERE id = ?').get(cardDbId) as { status: string; author_id: string } | undefined
    if (!cardRow || (cardRow.status !== 'published' && cardRow.author_id !== user.id)) {
      sendJson(res, 404, { ok: false, error: 'Card not found' }); return true
    }
    const existing = db.prepare('SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?').get(user.id, cardDbId)
    if (existing) {
      db.prepare('DELETE FROM card_likes WHERE user_id = ? AND card_id = ?').run(user.id, cardDbId)
      sendJson(res, 200, { ok: true, liked: false })
    } else {
      db.prepare('INSERT INTO card_likes (user_id, card_id, created_at) VALUES (?, ?, ?)').run(user.id, cardDbId, Date.now())
      sendJson(res, 200, { ok: true, liked: true })
    }
    return true
  }

  // ── GET /api/workshop/cards/:id/comments ─────────────────────────────────
  const commentsGetMatch = /^\/api\/workshop\/cards\/([^/]+)\/comments$/.exec(url)
  if (req.method === 'GET' && commentsGetMatch) {
    const cardDbId = commentsGetMatch[1]!
    const rows = db.prepare(`
      SELECT c.*, u.display_name AS author_name
      FROM card_comments c
      LEFT JOIN users u ON c.author_id = u.id
      WHERE c.card_id = ?
      ORDER BY c.created_at ASC
    `).all(cardDbId)
    sendJson(res, 200, { ok: true, comments: rows })
    return true
  }

  // ── POST /api/workshop/cards/:id/comments ────────────────────────────────
  const commentsPostMatch = /^\/api\/workshop\/cards\/([^/]+)\/comments$/.exec(url)
  if (req.method === 'POST' && commentsPostMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = commentsPostMatch[1]!
    const body = await parseBody<{ body?: string }>(req)
    const text = body?.body?.trim() ?? ''
    if (!text || text.length > 2000) {
      sendJson(res, 400, { ok: false, error: 'Comment body required (max 2000 chars)' }); return true
    }
    const id = nanoid()
    db.prepare('INSERT INTO card_comments (id, card_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, cardDbId, user.id, text, Date.now())
    sendJson(res, 200, { ok: true, id })
    return true
  }

  // ── GET /api/workshop/sandbox ─────────────────────────────────────────────
  if (req.method === 'GET' && url === '/api/workshop/sandbox') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const rows = db.prepare(`
      SELECT w.*, u.display_name AS author_name
      FROM sandbox_cards s
      JOIN workshop_cards w ON s.workshop_card_id = w.id
      LEFT JOIN users u ON w.author_id = u.id
      WHERE s.user_id = ?
      ORDER BY s.added_at DESC
    `).all(user.id) as WorkshopCard[]
    const cards = rows.map(r => ({
      ...r,
      card_json: JSON.parse(r.card_json as string),
    }))
    sendJson(res, 200, { ok: true, cards, settings: getSandboxSettings(user.id) })
    return true
  }

  // ── POST /api/workshop/sandbox ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/sandbox') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      workshop_card_id?: string
      workshop_card_ids?: string[]
      settings?: { player_count?: unknown; deck_ids?: unknown }
    }>(req)
    const MAX_SANDBOX_CARDS = 20
    if (body?.workshop_card_id) {
      const count = (db.prepare('SELECT COUNT(*) as c FROM sandbox_cards WHERE user_id = ?')
        .get(user.id) as { c: number }).c
      if (count >= MAX_SANDBOX_CARDS) {
        sendJson(res, 400, { ok: false, error: `Maximum ${MAX_SANDBOX_CARDS} sandbox cards allowed` })
        return true
      }
      const existing = db.prepare('SELECT 1 FROM sandbox_cards WHERE user_id = ? AND workshop_card_id = ?')
        .get(user.id, body.workshop_card_id)
      if (!existing) {
        db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
          .run(user.id, body.workshop_card_id, Date.now())
      }
      sendJson(res, 200, { ok: true, settings: getSandboxSettings(user.id) })
      return true
    }
    if (!Array.isArray(body?.workshop_card_ids)) {
      sendJson(res, 400, { ok: false, error: 'Missing workshop_card_ids' })
      return true
    }

    const nextIds = Array.from(new Set(body.workshop_card_ids.filter((id): id is string => typeof id === 'string')))
      .slice(0, MAX_SANDBOX_CARDS)
    const now = Date.now()
    const insertSandboxCard = db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
    db.transaction(() => {
      db.prepare('DELETE FROM sandbox_cards WHERE user_id = ?').run(user.id)
      for (const cardId of nextIds) {
        insertSandboxCard.run(user.id, cardId, now)
      }
    })()
    const settings = saveSandboxSettings(user.id, body.settings)
    sendJson(res, 200, { ok: true, settings })
    return true
  }

  // ── DELETE /api/workshop/sandbox/:id ─────────────────────────────────────
  const sandboxDeleteMatch = /^\/api\/workshop\/sandbox\/([^/]+)$/.exec(url)
  if (req.method === 'DELETE' && sandboxDeleteMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const workshopCardId = sandboxDeleteMatch[1]!
    db.prepare('DELETE FROM sandbox_cards WHERE user_id = ? AND workshop_card_id = ?').run(user.id, workshopCardId)
    sendJson(res, 200, { ok: true })
    return true
  }

  // ── GET /api/workshop/cards/:id/versions ──────────────────────────────────
  const versionsGetMatch = /^\/api\/workshop\/cards\/([^/]+)\/versions$/.exec(url)
  if (req.method === 'GET' && versionsGetMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = versionsGetMatch[1]!
    // Only owner can see version history (drafts or published)
    const cardRow = db.prepare('SELECT author_id FROM workshop_cards WHERE id = ?').get(cardDbId) as { author_id: string } | undefined
    if (!cardRow) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    if (cardRow.author_id !== user.id && !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }
    const rows = db.prepare(`
      SELECT id, version_number, card_json, art_url, created_at
      FROM workshop_card_versions
      WHERE card_id = ?
      ORDER BY version_number DESC
    `).all(cardDbId) as { id: string; version_number: number; card_json: string; art_url: string | null; created_at: number }[]

    const versions = rows.map(r => ({
      ...r,
      card_json: JSON.parse(r.card_json),
    }))
    sendJson(res, 200, { ok: true, versions })
    return true
  }

  // ── POST /api/workshop/cards/:id/revert ─────────────────────────────────
  const revertMatch = /^\/api\/workshop\/cards\/([^/]+)\/revert$/.exec(url)
  if (req.method === 'POST' && revertMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = revertMatch[1]!
    const body = await parseBody<{ version_id?: string }>(req)
    if (!body?.version_id) { sendJson(res, 400, { ok: false, error: 'Missing version_id' }); return true }

    const card = db.prepare('SELECT author_id FROM workshop_cards WHERE id = ?').get(cardDbId) as
      | { author_id: string } | undefined
    if (!card) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    if (card.author_id !== user.id) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }

    const version = db.prepare('SELECT * FROM workshop_card_versions WHERE id = ? AND card_id = ?')
      .get(body.version_id, cardDbId) as {
        card_json: string
        effect_code: string | null
        compiled_code: string | null
        code_manifest: string | null
        art_url: string | null
      } | undefined
    if (!version) { sendJson(res, 404, { ok: false, error: 'Version not found' }); return true }

    // Save current state as a version before reverting
    const current = db.prepare('SELECT card_json, effect_code, compiled_code, code_manifest, art_url FROM workshop_cards WHERE id = ?').get(cardDbId) as WorkshopCard
    const versionNum = ((db.prepare(
      'SELECT COALESCE(MAX(version_number), 0) AS n FROM workshop_card_versions WHERE card_id = ?',
    ).get(cardDbId) as { n: number })?.n ?? 0) + 1
    const now = Date.now()
    db.prepare(`
      INSERT INTO workshop_card_versions (id, card_id, card_json, effect_code, compiled_code, code_manifest, art_url, version_number, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(),
      cardDbId,
      current.card_json,
      current.effect_code ?? null,
      current.compiled_code ?? null,
      current.code_manifest ?? null,
      current.art_url ?? null,
      versionNum,
      user.id,
      now,
    )

    // Restore from version
    const restored = JSON.parse(version.card_json)
    db.prepare(`
      UPDATE workshop_cards SET
        card_json = ?, effect_code = ?, compiled_code = ?, code_manifest = ?, art_url = ?, name = ?, updated_at = ?
      WHERE id = ?
    `).run(
      version.card_json,
      version.effect_code,
      version.compiled_code,
      version.code_manifest,
      version.art_url,
      restored.name ?? '',
      now,
      cardDbId,
    )

    sendJson(res, 200, { ok: true })
    return true
  }

  // ── POST /api/workshop/cards/:id/feature ────────────────────────────────
  const featureMatch = /^\/api\/workshop\/cards\/([^/]+)\/feature$/.exec(url)
  if (req.method === 'POST' && featureMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    if (!isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const cardDbId = featureMatch[1]!
    const current = db.prepare('SELECT featured FROM workshop_cards WHERE id = ?').get(cardDbId) as
      | { featured: number } | undefined
    if (!current) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    const newVal = current.featured ? 0 : 1
    db.prepare('UPDATE workshop_cards SET featured = ? WHERE id = ?').run(newVal, cardDbId)
    sendJson(res, 200, { ok: true, featured: !!newVal })
    return true
  }

  // ═══════════ ADMIN API ═══════════════════════════════════════════════════

  // ── GET /api/admin/cards — list all cards with full details ─────────────
  if (req.method === 'GET' && (url === '/api/admin/cards' || url.startsWith('/api/admin/cards?'))) {
    if (!user || !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const q = new URL(url, 'http://localhost').searchParams
    const search = q.get('search')?.trim() ?? ''
    const status = q.get('status')
    const author = q.get('author')
    const page = Math.max(1, Number(q.get('page') ?? '1'))
    const limit = 50
    const offset = (page - 1) * limit

    let where = '1=1'
    const params: unknown[] = []
    if (search) { where += ' AND (w.name LIKE ? OR w.card_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    if (status === 'draft' || status === 'published') { where += ' AND w.status = ?'; params.push(status) }
    if (author) { where += ' AND u.username = ?'; params.push(author) }

    const rows = db.prepare(`
      SELECT w.*, u.username AS author_name
      FROM workshop_cards w LEFT JOIN users u ON w.author_id = u.id
      WHERE ${where}
      ORDER BY w.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Record<string, unknown>[]
    const total = (db.prepare(`SELECT COUNT(*) as cnt FROM workshop_cards w LEFT JOIN users u ON w.author_id = u.id WHERE ${where}`).get(...params) as { cnt: number }).cnt

    sendJson(res, 200, {
      ok: true,
      cards: rows.map(r => ({
        ...r,
        card_json: typeof r.card_json === 'string' ? JSON.parse(r.card_json as string) : r.card_json,
        code_manifest: r.code_manifest && typeof r.code_manifest === 'string' ? JSON.parse(r.code_manifest as string) : r.code_manifest,
      })),
      page,
      total,
    })
    return true
  }

  // ── GET /api/admin/cards/:id/export — export a single card as JSON ─────
  const adminExportMatch = /^\/api\/admin\/cards\/([^/]+)\/export$/.exec(url)
  if (req.method === 'GET' && adminExportMatch) {
    if (!user || !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const cardDbId = adminExportMatch[1]!
    const row = db.prepare(`
      SELECT w.*, u.username AS author_name
      FROM workshop_cards w LEFT JOIN users u ON w.author_id = u.id
      WHERE w.id = ?
    `).get(cardDbId) as Record<string, unknown> | undefined
    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }

    const card = {
      ...row,
      card_json: typeof row.card_json === 'string' ? JSON.parse(row.card_json as string) : row.card_json,
      code_manifest: row.code_manifest && typeof row.code_manifest === 'string' ? JSON.parse(row.code_manifest as string) : row.code_manifest,
    }
    sendJson(res, 200, { ok: true, card })
    return true
  }

  // ── DELETE /api/admin/cards/:id — admin delete any card ────────────────
  const adminDeleteMatch = /^\/api\/admin\/cards\/([^/]+)$/.exec(url)
  if (req.method === 'DELETE' && adminDeleteMatch) {
    if (!user || !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const cardDbId = adminDeleteMatch[1]!
    const row = db.prepare('SELECT card_id, name FROM workshop_cards WHERE id = ?').get(cardDbId) as
      | { card_id: string; name: string } | undefined
    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    db.prepare('DELETE FROM workshop_card_versions WHERE card_id = ?').run(cardDbId)
    db.prepare('DELETE FROM card_likes WHERE card_id = ?').run(cardDbId)
    db.prepare('DELETE FROM card_comments WHERE card_id = ?').run(cardDbId)
    db.prepare('DELETE FROM sandbox_cards WHERE workshop_card_id = ?').run(cardDbId)
    db.prepare('DELETE FROM workshop_cards WHERE id = ?').run(cardDbId)
    sendJson(res, 200, { ok: true, deleted: { id: cardDbId, card_id: row.card_id, name: row.name } })
    return true
  }

  // ── POST /api/admin/cards/:id/status — admin set card status ──────────
  const adminStatusMatch = /^\/api\/admin\/cards\/([^/]+)\/status$/.exec(url)
  if (req.method === 'POST' && adminStatusMatch) {
    if (!user || !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const cardDbId = adminStatusMatch[1]!
    const body = await parseBody<{ status?: string }>(req)
    const newStatus = body?.status === 'published' ? 'published' : 'draft'
    const row = db.prepare('SELECT id FROM workshop_cards WHERE id = ?').get(cardDbId) as { id: string } | undefined
    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    db.prepare('UPDATE workshop_cards SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, Date.now(), cardDbId)
    sendJson(res, 200, { ok: true, status: newStatus })
    return true
  }

  // ── GET /api/admin/users — list all users ─────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/admin/users')) {
    if (!user || !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true }
    const rows = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM workshop_cards WHERE author_id = u.id) AS card_count
      FROM users u ORDER BY u.created_at DESC
    `).all() as Record<string, unknown>[]
    sendJson(res, 200, { ok: true, users: rows })
    return true
  }

  return false
}
