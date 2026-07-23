import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'

export type WorkshopCardType = 'minor' | 'occupation'

export type WorkshopDraft = {
  cardId: string
  cardType: WorkshopCardType
  name: string
  description: string
  cardJson: Record<string, unknown>
  effectCode: string | null
  compiledCode: string | null
  codeManifest: Record<string, unknown> | null
  artUrl: string | null
  generation: Record<string, unknown>
}

export type WorkshopWorkspace = {
  id: string
  authorId: string
  revision: number
  status: string
  draft: WorkshopDraft
  publishedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
}

export type WorkshopArtCandidate = {
  id: string
  kind: 'art'
  prompt: string
  resultUrl: string
  provider?: string
  model?: string
  referenceImages?: string[]
  createdAt: number
}

export type WorkshopAbilityCandidate = {
  id: string
  kind: 'ability'
  prompt: string
  sourceCode: string
  compiledCode: string
  codeManifest: Record<string, unknown> | null
  validation: { valid: boolean; errors?: string[] }
  provider?: string
  model?: string
  createdAt: number
}

export type WorkshopCandidate = WorkshopArtCandidate | WorkshopAbilityCandidate

export type PublishedWorkshopCard = {
  id: string
  authorId: string
  authorName: string
  cardId: string
  cardType: WorkshopCardType
  name: string
  description: string
  cardJson: Record<string, unknown>
  effectCode: string | null
  artUrl: string | null
  status: 'published'
  likeCount: number
  likedByMe: boolean
  featured: number
  createdAt: number
  updatedAt: number
  publishedVersionId: string
  githubPrUrl: string | null
  githubPrStatus: string | null
  githubPrLastSyncedAt: number | null
}

export type WorkshopDraftErrorCode =
  | 'conflict'
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'not_ready'

export class WorkshopDraftError extends Error {
  readonly code: WorkshopDraftErrorCode
  readonly current?: WorkshopWorkspace

  constructor(
    code: WorkshopDraftErrorCode,
    message: string,
    current?: WorkshopWorkspace,
  ) {
    super(message)
    this.code = code
    this.current = current
  }
}

type WorkshopCardRow = {
  id: string
  author_id: string
  card_id: string
  card_type: string
  name: string
  description: string
  card_json: string
  code_manifest: string | null
  art_url: string | null
  status: string
  draft_revision: number
  draft_generation_json: string
  published_version_id: string | null
  sandbox_pass_version_id: string | null
  sandbox_passed_at: number | null
}

type WorkshopVersionRow = {
  id: string
  card_id: string
  card_json: string
  code_manifest: string | null
  art_url: string | null
  content_hash: string | null
  provenance_json: string
}

const parseRecord = (raw: string | null): Record<string, unknown> => {
  if (!raw) return {}
  const parsed = JSON.parse(raw) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

const serialiseDraft = (draft: WorkshopDraft): {
  cardJson: string
  codeManifest: string | null
  generation: string
} => ({
  cardJson: JSON.stringify({
    ...draft.cardJson,
    ...(draft.effectCode ? { _code: draft.effectCode } : {}),
    ...(draft.compiledCode ? { _compiled: draft.compiledCode } : {}),
  }),
  codeManifest: draft.codeManifest ? JSON.stringify(draft.codeManifest) : null,
  generation: JSON.stringify(draft.generation),
})

const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalise)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalise(entry)]),
  )
}

const hashVersionContent = (
  cardJson: Record<string, unknown>,
  codeManifest: Record<string, unknown> | null,
  artUrl: string | null,
): string => createHash('sha256')
  .update(JSON.stringify(canonicalise({
    artUrl,
    cardJson,
    codeManifest,
  })))
  .digest('hex')

const contentHash = (draft: WorkshopDraft): string => hashVersionContent(
  {
    ...draft.cardJson,
    ...(draft.effectCode ? { _code: draft.effectCode } : {}),
    ...(draft.compiledCode ? { _compiled: draft.compiledCode } : {}),
  },
  draft.codeManifest,
  draft.artUrl,
)

const rowToWorkspace = (row: WorkshopCardRow): WorkshopWorkspace => {
  const cardJson = parseRecord(row.card_json)
  const effectCode = typeof cardJson._code === 'string' ? cardJson._code : null
  const compiledCode = typeof cardJson._compiled === 'string' ? cardJson._compiled : null
  delete cardJson._code
  delete cardJson._compiled
  return {
    id: row.id,
    authorId: row.author_id,
    revision: row.draft_revision,
    status: row.status,
    draft: {
      cardId: row.card_id,
      cardType: row.card_type as WorkshopCardType,
      name: row.name,
      description: row.description,
      cardJson,
      effectCode,
      compiledCode,
      codeManifest: row.code_manifest ? parseRecord(row.code_manifest) : null,
      artUrl: row.art_url,
      generation: parseRecord(row.draft_generation_json),
    },
    publishedVersionId: row.published_version_id,
    sandboxPassVersionId: row.sandbox_pass_version_id,
    sandboxPassedAt: row.sandbox_passed_at,
  }
}

const validateDraft = (draft: WorkshopDraft): void => {
  if (!/^CUSTOM_[A-Za-z][A-Za-z0-9_]*$/.test(draft.cardId) || draft.cardId.length > 100) {
    throw new WorkshopDraftError('invalid', 'Invalid custom card id')
  }
  if (draft.cardType !== 'minor' && draft.cardType !== 'occupation') {
    throw new WorkshopDraftError('invalid', 'Invalid card type')
  }
  if (!draft.name.trim() || draft.name.length > 100 || draft.description.length > 4000) {
    throw new WorkshopDraftError('invalid', 'Invalid card name or description')
  }
  if (!draft.cardJson || typeof draft.cardJson !== 'object' || Array.isArray(draft.cardJson)) {
    throw new WorkshopDraftError('invalid', 'Invalid card definition')
  }
}

export function loadWorkspace(
  db: Database.Database,
  cardId: string,
  authorId: string,
): WorkshopWorkspace {
  const row = db.prepare('SELECT * FROM workshop_cards WHERE id = ?').get(cardId) as WorkshopCardRow | undefined
  if (!row) throw new WorkshopDraftError('not_found', 'Card not found')
  if (row.author_id !== authorId) throw new WorkshopDraftError('forbidden', 'Forbidden')
  return rowToWorkspace(row)
}

export function createCard(
  db: Database.Database,
  input: { authorId: string; draft: WorkshopDraft },
): WorkshopWorkspace {
  validateDraft(input.draft)
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM workshop_cards WHERE card_id = ?').get(input.draft.cardId)) {
      throw new WorkshopDraftError('conflict', 'Card id already exists')
    }
    const id = nanoid()
    const now = Date.now()
    const serialised = serialiseDraft(input.draft)
    db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, description,
        card_json, code_manifest, art_url, art_prompt, status,
        draft_generation_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      id,
      input.authorId,
      input.draft.cardId,
      input.draft.cardType,
      input.draft.name.trim(),
      input.draft.description,
      serialised.cardJson,
      serialised.codeManifest,
      input.draft.artUrl,
      null,
      serialised.generation,
      now,
      now,
    )
    return loadWorkspace(db, id, input.authorId)
  })()
}

export function checkpointDraft(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    draft: WorkshopDraft
  },
): WorkshopWorkspace {
  validateDraft(input.draft)
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    const duplicate = db.prepare(
      'SELECT 1 FROM workshop_cards WHERE card_id = ? AND id != ?',
    ).get(input.draft.cardId, input.cardId)
    if (duplicate) throw new WorkshopDraftError('conflict', 'Card id already exists', current)

    const serialised = serialiseDraft(input.draft)
    db.prepare(`
      UPDATE workshop_cards SET
        card_id = ?,
        card_type = ?,
        name = ?,
        description = ?,
        card_json = ?,
        code_manifest = ?,
        art_url = ?,
        draft_generation_json = ?,
        draft_revision = draft_revision + 1,
        sandbox_pass_version_id = NULL,
        sandbox_passed_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.draft.cardId,
      input.draft.cardType,
      input.draft.name.trim(),
      input.draft.description,
      serialised.cardJson,
      serialised.codeManifest,
      input.draft.artUrl,
      serialised.generation,
      Date.now(),
      input.cardId,
    )
    return loadWorkspace(db, input.cardId, input.authorId)
  })()
}

const ensureVersion = (
  db: Database.Database,
  workspace: WorkshopWorkspace,
): string => {
  const hash = contentHash(workspace.draft)
  const existing = db.prepare(`
    SELECT id FROM workshop_card_versions WHERE card_id = ? AND content_hash = ?
  `).get(workspace.id, hash) as { id: string } | undefined
  if (existing) return existing.id

  const versionNumber = (db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS value
    FROM workshop_card_versions WHERE card_id = ?
  `).get(workspace.id) as { value: number }).value
  const id = nanoid()
  const serialised = serialiseDraft(workspace.draft)
  db.prepare(`
    INSERT INTO workshop_card_versions (
      id, card_id, card_json, code_manifest, art_url, version_number,
      created_by, created_at, content_hash, provenance_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspace.id,
    serialised.cardJson,
    serialised.codeManifest,
    workspace.draft.artUrl,
    versionNumber,
    workspace.authorId,
    Date.now(),
    hash,
    serialised.generation,
  )
  return id
}

export function adoptCandidate(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    candidate: WorkshopCandidate
  },
): { workspace: WorkshopWorkspace; versionId: string } {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }

    const generation = structuredClone(current.draft.generation)
    generation[input.candidate.kind] = {
      lastCompleted: input.candidate,
      adopted: input.candidate,
    }
    let draft: WorkshopDraft
    if (input.candidate.kind === 'art') {
      if (!input.candidate.prompt.trim() || !input.candidate.resultUrl.trim()) {
        throw new WorkshopDraftError('invalid', 'Invalid art candidate')
      }
      draft = {
        ...current.draft,
        artUrl: input.candidate.resultUrl,
        generation,
      }
    } else {
      if (
        !input.candidate.validation.valid
        || !input.candidate.sourceCode.trim()
        || !input.candidate.compiledCode.trim()
        || !input.candidate.codeManifest
      ) {
        throw new WorkshopDraftError('not_ready', 'Ability candidate has not passed validation')
      }
      draft = {
        ...current.draft,
        effectCode: input.candidate.sourceCode,
        compiledCode: input.candidate.compiledCode,
        codeManifest: input.candidate.codeManifest,
        generation,
      }
    }
    const workspace = checkpointDraft(db, {
      cardId: input.cardId,
      authorId: input.authorId,
      baseRevision: input.baseRevision,
      draft,
    })
    return { workspace, versionId: ensureVersion(db, workspace) }
  })()
}

const staticValidation = (
  draft: WorkshopDraft,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = []
  try {
    validateDraft(draft)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Invalid draft')
  }
  if (draft.cardJson.id !== draft.cardId) errors.push('Card definition id does not match card id')
  if (draft.cardJson.name !== draft.name) errors.push('Card definition name does not match card name')
  if (
    draft.effectCode
    && (!draft.compiledCode || !draft.codeManifest)
  ) {
    errors.push('Ability source has not passed validation')
  }
  return { valid: errors.length === 0, errors }
}

const loadVersion = (
  db: Database.Database,
  cardId: string,
  versionId: string,
): WorkshopVersionRow => {
  const version = db.prepare(`
    SELECT id, card_id, card_json, code_manifest, art_url, content_hash, provenance_json
    FROM workshop_card_versions
    WHERE id = ? AND card_id = ?
  `).get(versionId, cardId) as WorkshopVersionRow | undefined
  if (!version) throw new WorkshopDraftError('not_found', 'Version not found')
  return version
}

const versionContentHash = (version: WorkshopVersionRow): string => version.content_hash
  ?? hashVersionContent(
    parseRecord(version.card_json),
    version.code_manifest ? parseRecord(version.code_manifest) : null,
    version.art_url,
  )

export function restoreVersion(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    versionId: string
  },
): WorkshopWorkspace {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    const version = loadVersion(db, input.cardId, input.versionId)
    const cardJson = parseRecord(version.card_json)
    const effectCode = typeof cardJson._code === 'string' ? cardJson._code : null
    const compiledCode = typeof cardJson._compiled === 'string' ? cardJson._compiled : null
    delete cardJson._code
    delete cardJson._compiled
    return checkpointDraft(db, {
      cardId: input.cardId,
      authorId: input.authorId,
      baseRevision: input.baseRevision,
      draft: {
        ...current.draft,
        name: typeof cardJson.name === 'string' ? cardJson.name : current.draft.name,
        cardJson,
        effectCode,
        compiledCode,
        codeManifest: version.code_manifest ? parseRecord(version.code_manifest) : null,
        artUrl: version.art_url,
        generation: parseRecord(version.provenance_json),
      },
    })
  })()
}

export function publish(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
  },
): { workspace: WorkshopWorkspace; versionId: string } {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    const validation = staticValidation(current.draft)
    if (!validation.valid) {
      throw new WorkshopDraftError('not_ready', validation.errors.join('; '), current)
    }
    const duplicate = db.prepare(`
      SELECT 1 FROM workshop_cards
      WHERE card_id = ? AND status = 'published' AND id != ?
    `).get(current.draft.cardId, current.id)
    if (duplicate) throw new WorkshopDraftError('conflict', 'Published card id already exists', current)

    const versionId = ensureVersion(db, current)
    db.prepare(`
      UPDATE workshop_cards
      SET status = 'published', published_version_id = ?, updated_at = ?
      WHERE id = ?
    `).run(versionId, Date.now(), current.id)
    return {
      workspace: loadWorkspace(db, current.id, input.authorId),
      versionId,
    }
  })()
}

export function markSandboxPass(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    versionId: string
    authorConfirmed: boolean
    runtimeErrors: string[]
  },
): WorkshopWorkspace {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    const version = loadVersion(db, current.id, input.versionId)
    if (
      !input.authorConfirmed
      || input.runtimeErrors.length > 0
      || versionContentHash(version) !== contentHash(current.draft)
    ) {
      throw new WorkshopDraftError('not_ready', 'Sandbox pass must confirm the exact error-free draft version', current)
    }
    db.prepare(`
      UPDATE workshop_cards
      SET sandbox_pass_version_id = ?, sandbox_passed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(input.versionId, Date.now(), Date.now(), current.id)
    return loadWorkspace(db, current.id, input.authorId)
  })()
}

export function getHandoffReadiness(
  db: Database.Database,
  cardId: string,
  authorId: string,
): {
  ready: boolean
  staticValidation: { valid: boolean; errors: string[] }
  publishedVersionMatchesDraft: boolean
  sandboxPassedForPublishedVersion: boolean
  publishedVersionId: string | null
} {
  const current = loadWorkspace(db, cardId, authorId)
  const validation = staticValidation(current.draft)
  const publishedVersionMatchesDraft = current.publishedVersionId !== null
    && versionContentHash(loadVersion(db, current.id, current.publishedVersionId)) === contentHash(current.draft)
  const sandboxPassedForPublishedVersion = publishedVersionMatchesDraft
    && current.sandboxPassVersionId === current.publishedVersionId
  return {
    ready: validation.valid && publishedVersionMatchesDraft && sandboxPassedForPublishedVersion,
    staticValidation: validation,
    publishedVersionMatchesDraft,
    sandboxPassedForPublishedVersion,
    publishedVersionId: current.publishedVersionId,
  }
}

export function loadPublishedCard(
  db: Database.Database,
  cardId: string,
  viewerId?: string,
): PublishedWorkshopCard {
  const row = db.prepare(`
    SELECT
      card.id,
      card.author_id,
      author.display_name AS author_name,
      card.card_id,
      card.card_type,
      card.name,
      card.description,
      card.featured,
      card.created_at,
      card.github_pr_url,
      card.github_pr_status,
      card.github_pr_last_synced_at,
      card.published_version_id,
      version.card_json AS version_card_json,
      version.art_url AS version_art_url,
      version.created_at AS version_created_at,
      COUNT(DISTINCT likes.user_id) AS like_count
    FROM workshop_cards card
    JOIN workshop_card_versions version ON version.id = card.published_version_id
    LEFT JOIN users author ON author.id = card.author_id
    LEFT JOIN card_likes likes ON likes.card_id = card.id
    WHERE card.id = ? AND card.status = 'published'
    GROUP BY card.id
  `).get(cardId) as {
    id: string
    author_id: string
    author_name: string | null
    card_id: string
    card_type: string
    name: string
    description: string
    featured: number
    created_at: number
    github_pr_url: string | null
    github_pr_status: string | null
    github_pr_last_synced_at: number | null
    published_version_id: string
    version_card_json: string
    version_art_url: string | null
    version_created_at: number
    like_count: number
  } | undefined
  if (!row) throw new WorkshopDraftError('not_found', 'Card not found')

  const cardJson = parseRecord(row.version_card_json)
  const effectCode = typeof cardJson._code === 'string' ? cardJson._code : null
  delete cardJson._code
  delete cardJson._compiled
  delete cardJson._draft
  const desc = Array.isArray(cardJson.desc)
    ? cardJson.desc.filter((line): line is string => typeof line === 'string').join(' ')
    : row.description
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? '',
    cardId: typeof cardJson.id === 'string' ? cardJson.id : row.card_id,
    cardType: cardJson.card_type === 'occupation' || cardJson.card_type === 'minor'
      ? cardJson.card_type
      : row.card_type as WorkshopCardType,
    name: typeof cardJson.name === 'string' ? cardJson.name : row.name,
    description: desc,
    cardJson,
    effectCode,
    artUrl: row.version_art_url,
    status: 'published',
    likeCount: row.like_count,
    likedByMe: viewerId
      ? Boolean(db.prepare('SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?').get(viewerId, row.id))
      : false,
    featured: row.featured,
    createdAt: row.created_at,
    updatedAt: row.version_created_at,
    publishedVersionId: row.published_version_id,
    githubPrUrl: row.github_pr_url,
    githubPrStatus: row.github_pr_status,
    githubPrLastSyncedAt: row.github_pr_last_synced_at,
  }
}
