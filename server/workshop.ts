import type { IncomingMessage, ServerResponse } from 'node:http'
import { getDb } from './db.ts'
import { validateSession, extractToken, isAdmin } from './auth.ts'
import { nanoid } from 'nanoid'
import { handleOAuthStart, handleOAuthCallback } from './workshop-pr/oauth-handler.ts'
import { handleSubmitReviewRequest, handleRefreshPrStatus } from './workshop-pr/propose-handler.ts'
import { corsHeaders } from './http-origin.ts'
import {
  WorkshopDraftError,
  adoptCandidate,
  checkpointDraft,
  createCard,
  getHandoffReadiness,
  invalidateReviewedCard,
  loadPublishedCard,
  loadWorkspace,
  markSandboxPass,
  pinCurrentDraftVersion,
  publish,
  unpublish,
  restoreVersion,
  type WorkshopAbilityCandidate,
  type WorkshopArtCandidate,
  type WorkshopDraft,
} from './workshop-drafts.ts'
import { isLoadableLive, isReviewStatus } from './workshop-status.ts'
import {
  prepareWorkshopAbilityCode,
  prepareWorkshopDraft,
  workshopCardJsonFromDefinition,
  type WorkshopDraftRequest,
} from './workshop-draft-validation.ts'
import {
  GitHubReviewProvider,
  findApprovedHeadReview,
  type WorkshopReviewSnapshot,
} from './workshop-review/github-review-provider.ts'
import {
  handleWorkshopReviewWebhook,
  type WorkshopReviewRuntime,
} from './workshop-review/webhook-handler.ts'

const defaultReviewProvider = GitHubReviewProvider.fromEnv()
const defaultReviewRuntime: WorkshopReviewRuntime | null = defaultReviewProvider
  && process.env.WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET?.trim()
  ? {
      webhookSecret: process.env.WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET.trim(),
      repositoryOwner: process.env.GITHUB_UPSTREAM_OWNER?.trim() || 'titanxxh',
      repositoryName: process.env.GITHUB_UPSTREAM_REPO?.trim() || 'open-agricola',
      provider: defaultReviewProvider,
    }
  : null

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...corsHeaders({ methods: 'GET,POST,PUT,DELETE,OPTIONS' }),
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

const sendWorkshopDraftError = (res: ServerResponse, error: unknown): boolean => {
  if (!(error instanceof WorkshopDraftError)) return false
  const status = {
    conflict: 409,
    forbidden: 403,
    invalid: 400,
    not_found: 404,
    not_ready: 400,
  }[error.code]
  sendJson(res, status, {
    ok: false,
    error: error.message,
    ...(error.current ? { current: error.current } : {}),
  })
  return true
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
  code_manifest?: string | null
  art_url: string | null
  review_status: string
  live: number
  featured?: number
  like_count?: number
  liked_by_me?: boolean
  created_at: number
  updated_at: number
  github_pr_url?: string | null
  github_pr_status?: string | null
  github_pr_last_synced_at?: number | null
}

/**
 * v7 schema: TS source + compiled JS live inside `card_json` under
 * the workshop-private fields `_code` / `_compiled` (same style as
 * `_draft`). The legacy top-level `effect_code` / `compiled_code` SQL
 * columns were dropped by migration v7 and are reconstructed from these
 * fields when serialising API responses.
 */
const extractCodeFromCardJson = (cardJsonRaw: string): {
  parsed: Record<string, unknown>
  code: string | null
  compiled: string | null
} => {
  const parsed = JSON.parse(cardJsonRaw) as Record<string, unknown>
  const code = typeof parsed._code === 'string' ? parsed._code : null
  const compiled = typeof parsed._compiled === 'string' ? parsed._compiled : null
  return { parsed, code, compiled }
}

const stripCardJsonCode = (cardJson: Record<string, unknown>): Record<string, unknown> => {
  const { _code: _c, _compiled: _cc, ...rest } = cardJson
  void _c; void _cc
  return rest
}

/** Serialise a DB row for the API: parse card_json, surface effect_code / compiled_code. */
const serialiseCardForApi = (
  row: WorkshopCard,
  extras: Record<string, unknown> = {},
  includePrivateDraft = false,
): Record<string, unknown> => {
  const { parsed, code, compiled } = extractCodeFromCardJson(row.card_json)
  const cardJson = stripCardJsonCode(parsed)
  if (!includePrivateDraft) delete cardJson._draft
  return {
    id: row.id,
    author_id: row.author_id,
    author_name: row.author_name,
    card_id: row.card_id,
    card_type: row.card_type,
    name: row.name,
    description: row.description,
    card_json: cardJson,
    effect_code: code,
    compiled_code: compiled,
    code_manifest: row.code_manifest ? JSON.parse(row.code_manifest) : null,
    art_url: row.art_url,
    review_status: row.review_status,
    live: row.live === 1,
    featured: row.featured ?? 0,
    like_count: row.like_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    github_pr_url: row.github_pr_url ?? null,
    github_pr_status: row.github_pr_status ?? null,
    github_pr_last_synced_at: row.github_pr_last_synced_at ?? null,
    ...extras,
  }
}

const serialisePublishedCardForApi = (
  card: ReturnType<typeof loadPublishedCard>,
): Record<string, unknown> => ({
  id: card.id,
  author_id: card.authorId,
  author_name: card.authorName,
  card_id: card.cardId,
  card_type: card.cardType,
  name: card.name,
  description: card.description,
  card_json: card.cardJson,
  effect_code: card.effectCode,
  art_url: card.artUrl,
  review_status: card.reviewStatus,
  live: card.live,
  featured: card.featured,
  like_count: card.likeCount,
  liked_by_me: card.likedByMe,
  created_at: card.createdAt,
  updated_at: card.updatedAt,
  approved_version_id: card.approvedVersionId,
  github_pr_url: card.githubPrUrl,
  github_pr_status: card.githubPrStatus,
  github_pr_last_synced_at: card.githubPrLastSyncedAt,
})

type SandboxSettings = {
  player_count: number
  deck_ids: string[]
  enable_through_the_seasons: boolean
  enable_farmers_of_the_moor: boolean
  allow_incomplete_farmers_of_the_moor_minor_deal: boolean
  enable_snake_opening: boolean
  updated_at?: number
}

type SandboxSettingsInput = {
  player_count?: unknown
  deck_ids?: unknown
  enable_through_the_seasons?: unknown
  enable_farmers_of_the_moor?: unknown
  allow_incomplete_farmers_of_the_moor_minor_deal?: unknown
  enable_snake_opening?: unknown
}

const SANDBOX_DECK_IDS = ['A', 'B', 'C', 'D', 'E'] as const

const sanitizeSandboxPlayerCount = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 2
  return Math.min(6, Math.max(2, Math.floor(parsed)))
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

const sanitizeSandboxSettings = (settings?: SandboxSettingsInput): SandboxSettings => {
  const enableFarmersOfTheMoor = settings?.enable_farmers_of_the_moor === true
  return {
    player_count: sanitizeSandboxPlayerCount(settings?.player_count),
    deck_ids: sanitizeSandboxDeckIds(settings?.deck_ids),
    enable_through_the_seasons: settings?.enable_through_the_seasons === true,
    enable_farmers_of_the_moor: enableFarmersOfTheMoor,
    allow_incomplete_farmers_of_the_moor_minor_deal: enableFarmersOfTheMoor && settings?.allow_incomplete_farmers_of_the_moor_minor_deal === true,
    enable_snake_opening: settings?.enable_snake_opening === true,
  }
}

const getSandboxSettings = (userId: string): SandboxSettings => {
  const db = getDb()
  const row = db.prepare(`
    SELECT player_count, deck_ids_json, enable_through_the_seasons, enable_farmers_of_the_moor, allow_incomplete_farmers_of_the_moor_minor_deal, enable_snake_opening, updated_at
    FROM sandbox_settings
    WHERE user_id = ?
  `).get(userId) as {
    player_count: number
    deck_ids_json: string
    enable_through_the_seasons: number
    enable_farmers_of_the_moor: number
    allow_incomplete_farmers_of_the_moor_minor_deal: number
    enable_snake_opening: number
    updated_at: number
  } | undefined
  if (!row) {
    return {
      player_count: 2,
      deck_ids: [...SANDBOX_DECK_IDS],
      enable_through_the_seasons: false,
      enable_farmers_of_the_moor: false,
      allow_incomplete_farmers_of_the_moor_minor_deal: false,
      enable_snake_opening: false,
    }
  }
  let rawDeckIds: unknown = []
  try {
    rawDeckIds = JSON.parse(row.deck_ids_json)
  } catch {
    rawDeckIds = []
  }
  const enableFarmersOfTheMoor = row.enable_farmers_of_the_moor === 1
  return {
    player_count: sanitizeSandboxPlayerCount(row.player_count),
    deck_ids: sanitizeSandboxDeckIds(rawDeckIds),
    enable_through_the_seasons: row.enable_through_the_seasons === 1,
    enable_farmers_of_the_moor: enableFarmersOfTheMoor,
    allow_incomplete_farmers_of_the_moor_minor_deal: enableFarmersOfTheMoor && row.allow_incomplete_farmers_of_the_moor_minor_deal === 1,
    enable_snake_opening: row.enable_snake_opening === 1,
    updated_at: row.updated_at,
  }
}

const saveSandboxSettings = (userId: string, settings?: SandboxSettingsInput): SandboxSettings => {
  const next: SandboxSettings = {
    ...sanitizeSandboxSettings(settings),
    updated_at: Date.now(),
  }
  const db = getDb()
  db.prepare(`
    INSERT INTO sandbox_settings (
      user_id,
      player_count,
      deck_ids_json,
      enable_through_the_seasons,
      enable_farmers_of_the_moor,
      allow_incomplete_farmers_of_the_moor_minor_deal,
      enable_snake_opening,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      player_count = excluded.player_count,
      deck_ids_json = excluded.deck_ids_json,
      enable_through_the_seasons = excluded.enable_through_the_seasons,
      enable_farmers_of_the_moor = excluded.enable_farmers_of_the_moor,
      allow_incomplete_farmers_of_the_moor_minor_deal = excluded.allow_incomplete_farmers_of_the_moor_minor_deal,
      enable_snake_opening = excluded.enable_snake_opening,
      updated_at = excluded.updated_at
  `).run(
    userId,
    next.player_count,
    JSON.stringify(next.deck_ids),
    next.enable_through_the_seasons ? 1 : 0,
    next.enable_farmers_of_the_moor ? 1 : 0,
    next.allow_incomplete_farmers_of_the_moor_minor_deal ? 1 : 0,
    next.enable_snake_opening ? 1 : 0,
    next.updated_at,
  )
  return next
}

/** Route handler — returns true if handled. */
export async function handleWorkshopRoute(
  req: IncomingMessage,
  res: ServerResponse,
  reviewRuntime: WorkshopReviewRuntime | null = defaultReviewRuntime,
): Promise<boolean> {
  const url = req.url ?? ''
  if (
    url !== '/api/github/webhook'
    && !url.startsWith('/api/workshop/')
    && !url.startsWith('/api/admin/')
  ) return false
  if (url === '/api/github/webhook') {
    if (!reviewRuntime) {
      sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
      return true
    }
    return handleWorkshopReviewWebhook(req, res, getDb(), reviewRuntime)
  }
  const routeUrl = new URL(url, 'http://localhost')

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

  // ── POST /api/workshop/cards/:id/submit-review ──────────────────────────
  // Entry to in_review (#637): opens or updates the review PR against
  // upstream from the author's fork, after the quality gate passes.
  const submitReviewMatch = /^\/api\/workshop\/cards\/([^/]+)\/submit-review$/.exec(url)
  if (req.method === 'POST' && submitReviewMatch) {
    await handleSubmitReviewRequest(
      req,
      res,
      submitReviewMatch[1]!,
      reviewRuntime?.provider,
    )
    return true
  }

  // ── POST /api/workshop/cards/:id/refresh-pr-status ──────────────────────
  // Queries the GitHub App to sync cached PR and review state.
  const refreshMatch = /^\/api\/workshop\/cards\/([^/]+)\/refresh-pr-status$/.exec(url)
  if (req.method === 'POST' && refreshMatch) {
    await handleRefreshPrStatus(req, res, refreshMatch[1]!, reviewRuntime?.provider)
    return true
  }

  // ── GET /api/workshop/cards ─────────────────────────────────────────────
  if (req.method === 'GET' && routeUrl.pathname === '/api/workshop/cards') {
    const q = routeUrl.searchParams
    const sort = q.get('sort') === 'popular' ? 'popular' : 'recent'
    const search = q.get('search')?.trim() ?? ''
    const page = Math.max(1, Number(q.get('page') ?? '1'))
    const limit = 20
    const offset = (page - 1) * limit
    const statusFilter = q.get('status')
    const mineOnly = q.get('scope') === 'mine'
    const roomOnly = q.get('scope') === 'room'
    const featured = q.get('featured') === '1'

    if (mineOnly) {
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Not authenticated' })
        return true
      }
      let where = 'w.author_id = ?'
      const params: unknown[] = [user.id]
      if (statusFilter === 'live') {
        where += ' AND w.live = 1'
      } else if (statusFilter && isReviewStatus(statusFilter)) {
        where += ' AND w.review_status = ?'
        params.push(statusFilter)
      }
      if (featured) where += ' AND w.featured = 1'
      if (search) {
        where += ' AND (w.name LIKE ? OR w.description LIKE ?)'
        params.push(`%${search}%`, `%${search}%`)
      }
      const orderBy = sort === 'popular'
        ? 'w.featured DESC, like_count DESC, w.updated_at DESC'
        : 'w.updated_at DESC'
      const rows = db.prepare(`
        SELECT w.*, u.display_name AS author_name,
               COUNT(DISTINCT l.user_id) AS like_count
        FROM workshop_cards w
        LEFT JOIN users u ON w.author_id = u.id
        LEFT JOIN card_likes l ON l.card_id = w.id
        WHERE ${where}
        GROUP BY w.id
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as WorkshopCard[]
      const ids = rows.map(r => r.id)
      const likedIds = ids.length > 0
        ? new Set((db.prepare(
            `SELECT card_id FROM card_likes WHERE user_id = ? AND card_id IN (${ids.map(() => '?').join(',')})`,
          ).all(user.id, ...ids) as { card_id: string }[]).map(row => row.card_id))
        : new Set<string>()
      const cards = rows.map(row => serialiseCardForApi(
        row,
        { liked_by_me: likedIds.has(row.id) },
        true,
      ))
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM workshop_cards w WHERE ${where}`)
        .get(...params) as { n: number }).n
      sendJson(res, 200, { ok: true, cards, page, total, hasMore: offset + rows.length < total })
      return true
    }

    let where = roomOnly
      ? "w.live = 1 AND (w.review_status = 'approved' OR (w.review_status = 'merged' AND w.built_in = 0)) AND w.approved_version_id IS NOT NULL"
      : "((w.review_status = 'approved' AND w.live = 1) OR w.review_status = 'merged') AND w.approved_version_id IS NOT NULL"
    const params: unknown[] = []
    if (featured) where += ' AND w.featured = 1'
    if (search) {
      where += ' AND version.card_json LIKE ?'
      params.push(`%${search}%`)
    }
    const orderBy = sort === 'popular'
      ? 'w.featured DESC, like_count DESC, version.created_at DESC'
      : 'version.created_at DESC'
    const rows = db.prepare(`
      SELECT w.id, COUNT(DISTINCT likes.user_id) AS like_count
      FROM workshop_cards w
      JOIN workshop_card_versions version ON version.id = w.approved_version_id
      LEFT JOIN card_likes likes ON likes.card_id = w.id
      WHERE ${where}
      GROUP BY w.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as { id: string }[]
    const cards = rows.map(row => serialisePublishedCardForApi(
      loadPublishedCard(db, row.id, user?.id),
    ))
    const total = (db.prepare(`
      SELECT COUNT(*) AS n
      FROM workshop_cards w
      JOIN workshop_card_versions version ON version.id = w.approved_version_id
      WHERE ${where}
    `).get(...params) as { n: number }).n
    sendJson(res, 200, { ok: true, cards, page, total, hasMore: offset + rows.length < total })
    return true
  }

  const workspaceMatch = /^\/api\/workshop\/cards\/([^/]+)\/workspace$/.exec(url)
  if (req.method === 'GET' && workspaceMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    try {
      const workspace = loadWorkspace(db, workspaceMatch[1]!, user.id)
      sendJson(res, 200, {
        ok: true,
        workspace,
        readiness: getHandoffReadiness(db, workspace.id, user.id),
      })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const draftMatch = /^\/api\/workshop\/cards\/([^/]+)\/draft$/.exec(url)
  if (req.method === 'PUT' && draftMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ baseRevision?: unknown; draft?: WorkshopDraftRequest }>(req)
    const prepared = await prepareWorkshopDraft(body?.draft)
    if (!prepared.ok) {
      sendJson(res, prepared.status, {
        ok: false,
        error: prepared.error,
        ...(prepared.errors ? { errors: prepared.errors } : {}),
      })
      return true
    }
    if (!Number.isInteger(body?.baseRevision)) {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision' })
      return true
    }
    try {
      const workspace = checkpointDraft(db, {
        cardId: draftMatch[1]!,
        authorId: user.id,
        baseRevision: body!.baseRevision as number,
        draft: prepared.draft,
      })
      sendJson(res, 200, { ok: true, workspace })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const adoptMatch = /^\/api\/workshop\/cards\/([^/]+)\/adopt$/.exec(url)
  if (req.method === 'POST' && adoptMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      baseRevision?: unknown
      candidate?: Record<string, unknown>
      artInputs?: unknown
    }>(req)
    if (!Number.isInteger(body?.baseRevision) || !body?.candidate) {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision or candidate' })
      return true
    }
    const raw = body.candidate
    let candidate: WorkshopArtCandidate | WorkshopAbilityCandidate
    let artInputs: { subject: string } | undefined
    if (raw.kind === 'art') {
      if (
        typeof raw.id !== 'string'
        || typeof raw.prompt !== 'string'
        || typeof raw.resultUrl !== 'string'
      ) {
        sendJson(res, 400, { ok: false, error: 'Invalid art candidate' })
        return true
      }
      if (body.artInputs !== undefined) {
        if (
          !body.artInputs
          || typeof body.artInputs !== 'object'
          || Array.isArray(body.artInputs)
          || typeof (body.artInputs as Record<string, unknown>).subject !== 'string'
        ) {
          sendJson(res, 400, { ok: false, error: 'Invalid art inputs' })
          return true
        }
        artInputs = {
          subject: (body.artInputs as Record<string, string>).subject!,
        }
      }
      candidate = {
        id: raw.id,
        kind: 'art',
        prompt: raw.promptFormat === 'subject' ? raw.prompt : artInputs?.subject ?? raw.prompt,
        ...(raw.promptFormat === 'subject' || artInputs
          ? { promptFormat: 'subject' as const }
          : {}),
        resultUrl: raw.resultUrl,
        ...(typeof raw.provider === 'string' ? { provider: raw.provider } : {}),
        ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
        ...(Array.isArray(raw.referenceImages)
          ? { referenceImages: raw.referenceImages.filter((value): value is string => typeof value === 'string') }
          : {}),
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      }
    } else if (raw.kind === 'ability') {
      if (
        typeof raw.id !== 'string'
        || typeof raw.prompt !== 'string'
        || typeof raw.sourceCode !== 'string'
      ) {
        sendJson(res, 400, { ok: false, error: 'Invalid ability candidate' })
        return true
      }
      let currentCardDefinitionId: string
      try {
        currentCardDefinitionId = loadWorkspace(db, adoptMatch[1]!, user.id).draft.cardId
      } catch (error) {
        if (sendWorkshopDraftError(res, error)) return true
        throw error
      }
      let prepared = await prepareWorkshopAbilityCode(raw.sourceCode, currentCardDefinitionId)
      if (!prepared.ok) {
        sendJson(res, prepared.status, prepared)
        return true
      }
      let cardJson = workshopCardJsonFromDefinition(prepared.cardDefinition)
      if (!cardJson) {
        sendJson(res, 400, { ok: false, error: 'Ability candidate has invalid CARD_DEF metadata' })
        return true
      }
      if (cardJson.id !== currentCardDefinitionId) {
        prepared = await prepareWorkshopAbilityCode(raw.sourceCode, cardJson.id as string)
        if (!prepared.ok) {
          sendJson(res, prepared.status, prepared)
          return true
        }
        cardJson = workshopCardJsonFromDefinition(prepared.cardDefinition)
        if (!cardJson) {
          sendJson(res, 400, { ok: false, error: 'Ability candidate has invalid CARD_DEF metadata' })
          return true
        }
      }
      candidate = {
        id: raw.id,
        kind: 'ability',
        prompt: raw.prompt,
        sourceCode: raw.sourceCode,
        cardJson,
        compiledCode: prepared.compiledCode,
        codeManifest: prepared.codeManifest,
        validation: { valid: true },
        ...(typeof raw.provider === 'string' ? { provider: raw.provider } : {}),
        ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      }
    } else {
      sendJson(res, 400, { ok: false, error: 'Invalid candidate kind' })
      return true
    }
    try {
      const result = adoptCandidate(db, {
        cardId: adoptMatch[1]!,
        authorId: user.id,
        baseRevision: body.baseRevision as number,
        candidate,
        ...(artInputs ? { artInputs } : {}),
      })
      sendJson(res, 200, { ok: true, ...result })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const restoreMatch = /^\/api\/workshop\/cards\/([^/]+)\/restore$/.exec(url)
  if (req.method === 'POST' && restoreMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ baseRevision?: unknown; versionId?: unknown }>(req)
    if (!Number.isInteger(body?.baseRevision) || typeof body?.versionId !== 'string') {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision or versionId' })
      return true
    }
    try {
      const workspace = restoreVersion(db, {
        cardId: restoreMatch[1]!,
        authorId: user.id,
        baseRevision: body.baseRevision as number,
        versionId: body.versionId,
      })
      sendJson(res, 200, { ok: true, workspace })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const publishMatch = /^\/api\/workshop\/cards\/([^/]+)\/publish$/.exec(url)
  if (req.method === 'POST' && publishMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ baseRevision?: unknown }>(req)
    const baseRevision = body?.baseRevision
    if (!Number.isInteger(baseRevision)) {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision' })
      return true
    }
    try {
      const workspace = loadWorkspace(db, publishMatch[1]!, user.id)
      if (workspace.revision !== baseRevision) {
        throw new WorkshopDraftError('conflict', 'Draft revision conflict', workspace)
      }
      if (workspace.reviewStatus !== 'approved' || !workspace.approvedVersionId) {
        throw new WorkshopDraftError(
          'not_ready',
          'Card must pass PR review approval before it can be published',
          workspace,
        )
      }
      if (!reviewRuntime) {
        sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
        return true
      }
      const binding = db.prepare(`
        SELECT github_pr_url, approved_commit_sha, approved_version_id,
               review_commit_sha, review_version_id, updated_at
        FROM workshop_cards WHERE id = ?
      `).get(publishMatch[1]!) as {
        github_pr_url: string | null
        approved_commit_sha: string | null
        approved_version_id: string | null
        review_commit_sha: string | null
        review_version_id: string | null
        updated_at: number
      }
      const prUrl = binding.github_pr_url
      let prNumber: number | null = null
      if (prUrl) {
        try {
          const parsed = new URL(prUrl)
          const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(parsed.pathname)
          if (
            parsed.protocol === 'https:'
            && parsed.hostname === 'github.com'
            && match?.[1]?.toLowerCase() === reviewRuntime.repositoryOwner.toLowerCase()
            && match[2]?.toLowerCase() === reviewRuntime.repositoryName.toLowerCase()
          ) prNumber = Number(match[3])
        } catch {
          prNumber = null
        }
      }
      if (!prUrl || !Number.isSafeInteger(prNumber) || prNumber! <= 0) {
        sendJson(res, 409, { ok: false, code: 'review_stale' })
        return true
      }
      let snapshot: WorkshopReviewSnapshot
      try {
        snapshot = await reviewRuntime.provider.getPullRequestSnapshot(prNumber!)
      } catch {
        sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
        return true
      }
      const approvedReview = findApprovedHeadReview(snapshot)
      if (
        !approvedReview
        || snapshot.headRefOid !== binding.approved_commit_sha
        || snapshot.headRefOid !== binding.review_commit_sha
        || binding.approved_version_id !== binding.review_version_id
      ) {
        invalidateReviewedCard(db, {
          prUrl,
          expectedBinding: {
            id: workspace.id,
            revision: workspace.revision,
            approvedCommitSha: binding.approved_commit_sha,
            approvedVersionId: binding.approved_version_id,
            reviewCommitSha: binding.review_commit_sha,
            reviewVersionId: binding.review_version_id,
            updatedAt: binding.updated_at,
          },
        })
        const current = loadWorkspace(db, publishMatch[1]!, user.id)
        sendJson(res, 409, { ok: false, code: 'review_stale', current })
        return true
      }
      const result = publish(db, {
        cardId: publishMatch[1]!,
        authorId: user.id,
        baseRevision: baseRevision as number,
        expectedUpdatedAt: binding.updated_at,
      })
      sendJson(res, 200, { ok: true, ...result })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const pinVersionMatch = /^\/api\/workshop\/cards\/([^/]+)\/pin-version$/.exec(url)
  if (req.method === 'POST' && pinVersionMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ baseRevision?: unknown }>(req)
    if (!Number.isInteger(body?.baseRevision)) {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision' })
      return true
    }
    try {
      const result = pinCurrentDraftVersion(db, {
        cardId: pinVersionMatch[1]!,
        authorId: user.id,
        baseRevision: body!.baseRevision as number,
      })
      sendJson(res, 200, { ok: true, ...result })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const unpublishMatch = /^\/api\/workshop\/cards\/([^/]+)\/unpublish$/.exec(url)
  if (req.method === 'POST' && unpublishMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ baseRevision?: unknown }>(req)
    if (!Number.isInteger(body?.baseRevision)) {
      sendJson(res, 400, { ok: false, error: 'Missing baseRevision' })
      return true
    }
    try {
      const workspace = unpublish(db, {
        cardId: unpublishMatch[1]!,
        authorId: user.id,
        baseRevision: body!.baseRevision as number,
      })
      sendJson(res, 200, { ok: true, workspace })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  const sandboxPassMatch = /^\/api\/workshop\/cards\/([^/]+)\/sandbox-pass$/.exec(url)
  if (req.method === 'POST' && sandboxPassMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      versionId?: unknown
      authorConfirmed?: unknown
      runtimeErrors?: unknown
    }>(req)
    if (typeof body?.versionId !== 'string' || body.authorConfirmed !== true || !Array.isArray(body.runtimeErrors)) {
      sendJson(res, 400, { ok: false, error: 'Invalid sandbox pass' })
      return true
    }
    try {
      const workspace = markSandboxPass(db, {
        cardId: sandboxPassMatch[1]!,
        authorId: user.id,
        versionId: body.versionId,
        authorConfirmed: body.authorConfirmed,
        runtimeErrors: body.runtimeErrors.filter((value): value is string => typeof value === 'string'),
      })
      sendJson(res, 200, { ok: true, workspace })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  // ── GET /api/workshop/cards/:id ─────────────────────────────────────────
  const cardDetailMatch = /^\/api\/workshop\/cards\/([^/]+)$/.exec(url)
  if (req.method === 'GET' && cardDetailMatch) {
    const cardDbId = cardDetailMatch[1]!
    try {
      sendJson(res, 200, {
        ok: true,
        card: serialisePublishedCardForApi(loadPublishedCard(db, cardDbId, user?.id)),
      })
    } catch (error) {
      const ownerCard = user
        ? db.prepare(`
            SELECT w.*, u.display_name AS author_name,
                   COUNT(DISTINCT likes.user_id) AS like_count
            FROM workshop_cards w
            LEFT JOIN users u ON u.id = w.author_id
            LEFT JOIN card_likes likes ON likes.card_id = w.id
            WHERE w.id = ? AND w.author_id = ?
            GROUP BY w.id
          `).get(cardDbId, user.id) as WorkshopCard | undefined
        : undefined
      if (ownerCard) {
        sendJson(res, 200, {
          ok: true,
          card: serialiseCardForApi(ownerCard, {
            liked_by_me: Boolean(db.prepare(
              'SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?',
            ).get(user!.id, cardDbId)),
          }),
        })
        return true
      }
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  // ── POST /api/workshop/cards/validate-code ──────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/cards/validate-code') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{ source?: string; card_id?: string }>(req)
    if (!body?.source || typeof body.source !== 'string') {
      sendJson(res, 400, { ok: false, error: 'Missing source' }); return true
    }
    if (!body.card_id || typeof body.card_id !== 'string') {
      sendJson(res, 400, { ok: false, error: 'Missing card_id' }); return true
    }
    const result = await prepareWorkshopAbilityCode(body.source, body.card_id)
    if (!result.ok) {
      if (result.status === 400) {
        sendJson(res, 200, { ok: true, valid: false, errors: result.errors })
      } else {
        sendJson(res, result.status, result)
      }
      return true
    }
    sendJson(res, 200, {
      ok: true,
      valid: true,
      compiled: result.compiledCode,
      manifest: result.codeManifest,
    })
    return true
  }

  // ── POST /api/workshop/cards ─────────────────────────────────────────────
  // Create a card (auth required)
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
    if (body.id || body.status === 'published') {
      sendJson(res, 400, {
        ok: false,
        error: 'Use revisioned draft and publish commands for existing cards',
      })
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

    // Validate + compile effect_code if provided. TS source + compiled JS are
    // folded into card_json (`_code` / `_compiled`). Manifest stays in its own
    // SQL column so room loaders can SELECT it without parsing card_json.
    let effectCode: string | null = null
    let compiledCode: string | null = null
    let codeManifest: string | null = null
    if (body.effect_code && typeof body.effect_code === 'string' && body.effect_code.trim()) {
      const prepared = await prepareWorkshopAbilityCode(body.effect_code, body.card_id)
      if (!prepared.ok) {
        sendJson(res, prepared.status, prepared)
        return true
      }
      effectCode = body.effect_code
      compiledCode = prepared.compiledCode
      codeManifest = JSON.stringify(prepared.codeManifest)
    }

    try {
      const draft: WorkshopDraft = {
        cardId: body.card_id,
        cardType: body.card_type as WorkshopDraft['cardType'],
        name: body.name,
        description: body.description ?? '',
        cardJson: stripCardJsonCode(body.card_json as Record<string, unknown>),
        effectCode,
        compiledCode,
        codeManifest: codeManifest ? JSON.parse(codeManifest) as Record<string, unknown> : null,
        artUrl: body.art_url ?? null,
        generation: {},
      }
      const workspace = createCard(db, { authorId: user.id, draft })
      sendJson(res, 200, { ok: true, id: workspace.id })
    } catch (error) {
      if (!sendWorkshopDraftError(res, error)) throw error
    }
    return true
  }

  // ── DELETE /api/workshop/cards/:id ──────────────────────────────────────
  const cardDeleteMatch = /^\/api\/workshop\/cards\/([^/]+)$/.exec(url)
  if (req.method === 'DELETE' && cardDeleteMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = cardDeleteMatch[1]!
    const row = db.prepare('SELECT author_id, review_status FROM workshop_cards WHERE id = ?').get(cardDbId) as
      | { author_id: string; review_status: string } | undefined
    if (!row) { sendJson(res, 404, { ok: false, error: 'Card not found' }); return true }
    if (row.author_id !== user.id && !isAdmin(user.username)) { sendJson(res, 403, { ok: false, error: 'Forbidden' }); return true }
    if (row.review_status === 'merged' && !isAdmin(user.username)) {
      sendJson(res, 403, { ok: false, error: 'Merged cards are permanent memorials; contact an admin' })
      return true
    }
    db.prepare('DELETE FROM workshop_cards WHERE id = ?').run(cardDbId)
    sendJson(res, 200, { ok: true })
    return true
  }

  // ── POST /api/workshop/cards/:id/like ────────────────────────────────────
  const likeMatch = /^\/api\/workshop\/cards\/([^/]+)\/like$/.exec(url)
  if (req.method === 'POST' && likeMatch) {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const cardDbId = likeMatch[1]!
    const cardRow = db.prepare('SELECT review_status, live, built_in, author_id FROM workshop_cards WHERE id = ?').get(cardDbId) as { review_status: string; live: number; built_in: number; author_id: string } | undefined
    const publiclyVisible = cardRow
      && (isLoadableLive(cardRow) || cardRow.review_status === 'merged')
    if (!cardRow || (!publiclyVisible && cardRow.author_id !== user.id)) {
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
    const cards = rows.flatMap(row => {
      if (isLoadableLive(row)) {
        try {
          return [serialisePublishedCardForApi(loadPublishedCard(db, row.id, user.id))]
        } catch {
          return []
        }
      }
      return row.author_id === user.id ? [serialiseCardForApi(row)] : []
    })
    sendJson(res, 200, { ok: true, cards, settings: getSandboxSettings(user.id) })
    return true
  }

  // ── POST /api/workshop/sandbox ────────────────────────────────────────────
  if (req.method === 'POST' && url === '/api/workshop/sandbox') {
    if (!user) { sendJson(res, 401, { ok: false, error: 'Not authenticated' }); return true }
    const body = await parseBody<{
      workshop_card_id?: string
      workshop_card_ids?: string[]
      settings?: SandboxSettingsInput
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
      LIMIT 5
    `).all(cardDbId) as { id: string; version_number: number; card_json: string; art_url: string | null; created_at: number }[]

    const versions = rows.map(r => ({
      ...r,
      card_json: JSON.parse(r.card_json),
    }))
    sendJson(res, 200, { ok: true, versions })
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
    if (status === 'live') { where += ' AND w.live = 1' }
    else if (status && isReviewStatus(status)) { where += ' AND w.review_status = ?'; params.push(status) }
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
      cards: rows.map(row => serialiseCardForApi(row as unknown as WorkshopCard)),
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

    const card = serialiseCardForApi(row as unknown as WorkshopCard)
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
