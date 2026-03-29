import type { IncomingMessage, ServerResponse } from 'node:http'
import { getDb } from './db.ts'
import { validateSession, extractToken, isAdmin } from './auth.ts'
import { nanoid } from 'nanoid'
import { validateCardCode } from './ast-validator.ts'
import { compileCardCode } from './card-compiler.ts'
import { generateCardFile, wrapUserCode, generateCodeTemplate, type CardMeta } from './card-codegen.ts'
import { writeCardFile, deleteCardFile } from './card-file-manager.ts'

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
  effect_dsl: string | null
  art_url: string | null
  status: string
  like_count?: number
  liked_by_me?: boolean
  created_at: number
  updated_at: number
}

/** Generate and write .ts card file from save data. */
function generateAndWriteCardFile(
  cardId: string, cardType: 'minor' | 'occupation', name: string,
  description: string, cardJson: unknown, effectDsl: unknown, effectCode: string | null,
): void {
  try {
    const cj = cardJson as Record<string, unknown>
    const meta: CardMeta = {
      id: cardId,
      name,
      cardType,
      desc: description ? [description] : (cj.desc as string[] ?? []),
      cost: (cj.cost as Record<string, number>) ?? {},
      vp: (cj.vp as number) ?? 0,
      modifiers: cj.modifiers as unknown[] | undefined,
    }

    let tsSource: string
    if (effectCode) {
      // User-written code mode — wrap with imports + card definition
      tsSource = wrapUserCode(meta, effectCode)
    } else {
      // DSL mode — generate from DSL JSON
      const dsl = effectDsl ? (typeof effectDsl === 'string' ? JSON.parse(effectDsl) : effectDsl) : null
      tsSource = generateCardFile(meta, dsl)
    }

    writeCardFile(cardId, tsSource)
  } catch (err) {
    console.warn(`[workshop] failed to generate .ts file for ${cardId}:`, err)
  }
}

/** Route handler — returns true if handled. */
export async function handleWorkshopRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url ?? ''
  if (!url.startsWith('/api/workshop/')) return false

  const token = extractToken(req.headers.authorization)
  const user = validateSession(token)
  const db = getDb()

  // ── GET /api/workshop/cards ─────────────────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/workshop/cards') && !url.includes('/comments') && !url.includes('/like')) {
    const q = new URL(url, 'http://localhost').searchParams
    const sort = q.get('sort') === 'popular' ? 'popular' : 'recent'
    const search = q.get('search')?.trim() ?? ''
    const page = Math.max(1, Number(q.get('page') ?? '1'))
    const limit = 20
    const offset = (page - 1) * limit
    const statusFilter = q.get('status') ?? 'published'

    // Only admins/authors can see non-published cards; enforce published for public
    const effectiveStatus = user ? (statusFilter === 'draft' ? 'draft' : 'published') : 'published'

    const featured = q.get('featured') === '1'

    let whereExtra = ''
    const params: unknown[] = [effectiveStatus]

    if (featured) {
      whereExtra += ' AND w.featured = 1'
    }

    if (search) {
      whereExtra += ' AND (w.name LIKE ? OR w.description LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    // Filter own drafts by author
    if (effectiveStatus === 'draft' && user) {
      whereExtra += ' AND w.author_id = ?'
      params.push(user.id)
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
      WHERE w.status = ?${whereExtra}
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
      effect_dsl: r.effect_dsl ? JSON.parse(r.effect_dsl as string) : null,
      liked_by_me: likedIds.has(r.id),
    }))

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM workshop_cards w WHERE w.status = ?${whereExtra}`)
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
        effect_dsl: row.effect_dsl ? JSON.parse(row.effect_dsl as string) : null,
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
    const result = validateCardCode(body.source)
    if (result.valid) {
      try {
        const compiled = compileCardCode(body.source)
        sendJson(res, 200, { ok: true, valid: true, compiled })
      } catch (err) {
        sendJson(res, 200, { ok: true, valid: false, errors: [`Compilation failed: ${err}`] })
      }
    } else {
      sendJson(res, 200, { ok: true, valid: false, errors: result.errors })
    }
    return true
  }

  // ── POST /api/workshop/cards/preview-code ─────────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/cards/preview-code') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      card_id?: string; card_type?: string; name?: string; description?: string
      card_json?: unknown; effect_dsl?: unknown
    }>(req)
    if (!body?.card_id) { sendJson(res, 400, { ok: false, error: 'Missing card_id' }); return true }

    const cj = (body.card_json ?? {}) as Record<string, unknown>
    const meta: CardMeta = {
      id: body.card_id,
      name: body.name ?? '',
      cardType: (body.card_type === 'occupation' ? 'occupation' : 'minor'),
      desc: body.description ? [body.description] : (cj.desc as string[] ?? []),
      cost: (cj.cost as Record<string, number>) ?? {},
      vp: (cj.vp as number) ?? 0,
    }

    const dsl = body.effect_dsl ? (typeof body.effect_dsl === 'string' ? JSON.parse(body.effect_dsl as string) : body.effect_dsl) : null
    const code = generateCardFile(meta, dsl)
    sendJson(res, 200, { ok: true, code })
    return true
  }

  // ── POST /api/workshop/cards/generate-template ────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/cards/generate-template') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      card_id?: string; card_type?: string; name?: string; description?: string
      card_json?: unknown
    }>(req)
    if (!body?.card_id) { sendJson(res, 400, { ok: false, error: 'Missing card_id' }); return true }

    const cj = (body.card_json ?? {}) as Record<string, unknown>
    const meta: CardMeta = {
      id: body.card_id,
      name: body.name ?? '',
      cardType: (body.card_type === 'occupation' ? 'occupation' : 'minor'),
      desc: body.description ? [body.description] : (cj.desc as string[] ?? []),
      cost: (cj.cost as Record<string, number>) ?? {},
      vp: (cj.vp as number) ?? 0,
    }
    sendJson(res, 200, { ok: true, code: generateCodeTemplate(meta) })
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
      effect_dsl?: unknown
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
    if (body.effect_code && typeof body.effect_code === 'string' && body.effect_code.trim()) {
      const validation = validateCardCode(body.effect_code)
      if (!validation.valid) {
        sendJson(res, 400, { ok: false, error: 'Code validation failed', errors: validation.errors })
        return true
      }
      effectCode = body.effect_code
      compiledCode = compileCardCode(body.effect_code)
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
        INSERT INTO workshop_card_versions (id, card_id, card_json, effect_dsl, effect_code, compiled_code, art_url, version_number, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nanoid(), body.id, existing.card_json, existing.effect_dsl ?? null,
        null, null, existing.art_url ?? null, versionNum, user.id, now,
      )

      db.prepare(`
        UPDATE workshop_cards SET
          card_id = ?, card_type = ?, name = ?, description = ?,
          card_json = ?, effect_dsl = ?, effect_code = ?, compiled_code = ?,
          art_url = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        body.card_id, body.card_type, body.name, body.description ?? '',
        JSON.stringify(body.card_json),
        body.effect_dsl ? JSON.stringify(body.effect_dsl) : null,
        effectCode, compiledCode,
        body.art_url ?? null, newStatus, now, body.id,
      )

      // Generate .ts card file
      generateAndWriteCardFile(body.card_id, body.card_type as 'minor' | 'occupation', body.name, body.description ?? '', body.card_json, body.effect_dsl, effectCode)

      sendJson(res, 200, { ok: true, id: body.id })
    } else {
      // Create new
      const id = nanoid()
      db.prepare(`
        INSERT INTO workshop_cards
          (id, author_id, card_id, card_type, name, description, card_json, effect_dsl, effect_code, compiled_code, art_url, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, user.id, body.card_id, body.card_type, body.name, body.description ?? '',
        JSON.stringify(body.card_json),
        body.effect_dsl ? JSON.stringify(body.effect_dsl) : null,
        effectCode, compiledCode,
        body.art_url ?? null, newStatus, now, now,
      )

      // Generate .ts card file
      generateAndWriteCardFile(body.card_id, body.card_type as 'minor' | 'occupation', body.name, body.description ?? '', body.card_json, body.effect_dsl, effectCode)

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
    if (row.author_id !== user.id) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }
    // Get card_id before deleting to remove the .ts file
    const delCard = db.prepare('SELECT card_id FROM workshop_cards WHERE id = ?').get(cardDbId) as { card_id: string } | undefined
    db.prepare('DELETE FROM workshop_cards WHERE id = ?').run(cardDbId)
    if (delCard) deleteCardFile(delCard.card_id)
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
      effect_dsl: r.effect_dsl ? JSON.parse(r.effect_dsl as string) : null,
    }))
    sendJson(res, 200, { ok: true, cards })
    return true
  }

  // ── POST /api/workshop/sandbox ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/sandbox') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ workshop_card_id?: string }>(req)
    if (!body?.workshop_card_id) { sendJson(res, 400, { ok: false, error: 'Missing workshop_card_id' }); return true }
    const existing = db.prepare('SELECT 1 FROM sandbox_cards WHERE user_id = ? AND workshop_card_id = ?')
      .get(user.id, body.workshop_card_id)
    if (!existing) {
      db.prepare('INSERT INTO sandbox_cards (user_id, workshop_card_id, added_at) VALUES (?, ?, ?)')
        .run(user.id, body.workshop_card_id, Date.now())
    }
    sendJson(res, 200, { ok: true })
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
      SELECT id, version_number, card_json, effect_dsl, art_url, created_at
      FROM workshop_card_versions
      WHERE card_id = ?
      ORDER BY version_number DESC
    `).all(cardDbId) as { id: string; version_number: number; card_json: string; effect_dsl: string | null; art_url: string | null; created_at: number }[]

    const versions = rows.map(r => ({
      ...r,
      card_json: JSON.parse(r.card_json),
      effect_dsl: r.effect_dsl ? JSON.parse(r.effect_dsl) : null,
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
      .get(body.version_id, cardDbId) as { card_json: string; effect_dsl: string | null; art_url: string | null } | undefined
    if (!version) { sendJson(res, 404, { ok: false, error: 'Version not found' }); return true }

    // Save current state as a version before reverting
    const current = db.prepare('SELECT card_json, effect_dsl, art_url FROM workshop_cards WHERE id = ?').get(cardDbId) as WorkshopCard
    const versionNum = ((db.prepare(
      'SELECT COALESCE(MAX(version_number), 0) AS n FROM workshop_card_versions WHERE card_id = ?',
    ).get(cardDbId) as { n: number })?.n ?? 0) + 1
    const now = Date.now()
    db.prepare(`
      INSERT INTO workshop_card_versions (id, card_id, card_json, effect_dsl, effect_code, compiled_code, art_url, version_number, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nanoid(), cardDbId, current.card_json, current.effect_dsl ?? null, null, null, current.art_url ?? null, versionNum, user.id, now)

    // Restore from version
    const restored = JSON.parse(version.card_json)
    db.prepare(`
      UPDATE workshop_cards SET
        card_json = ?, effect_dsl = ?, art_url = ?, name = ?, updated_at = ?
      WHERE id = ?
    `).run(version.card_json, version.effect_dsl, version.art_url, restored.name ?? '', now, cardDbId)

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

  return false
}
