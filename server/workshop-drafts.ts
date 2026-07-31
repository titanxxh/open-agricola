import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import type {
  WorkshopAbilityCandidateContract,
  WorkshopArtCandidateContract,
  WorkshopCardType,
  WorkshopDraftContract,
  WorkshopWorkspaceContract,
} from '../shared/contract/workshop'
import { workshopCardJsonFromDefinition } from './workshop-draft-validation.ts'
import { canGoLive, isReviewStatus, type ReviewStatus } from './workshop-status.ts'
import { getReviewDecisionProvider } from './workshop-review-provider.ts'

export type WorkshopDraft = WorkshopDraftContract & {
  compiledCode: string | null
  codeManifest: Record<string, unknown> | null
}
export type WorkshopWorkspace = Omit<WorkshopWorkspaceContract, 'draft'> & {
  draft: WorkshopDraft
}

export type WorkshopArtCandidate = WorkshopArtCandidateContract

export type WorkshopAbilityCandidate = WorkshopAbilityCandidateContract & {
  compiledCode: string
  codeManifest: Record<string, unknown> | null
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
  reviewStatus: ReviewStatus
  live: boolean
  likeCount: number
  likedByMe: boolean
  featured: number
  createdAt: number
  updatedAt: number
  approvedVersionId: string
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
  review_status: string
  live: number
  draft_revision: number
  draft_generation_json: string
  approved_commit_sha: string | null
  approved_review_id: string | null
  approved_at: number | null
  approved_version_id: string | null
  built_in: number
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

export const hasReservedCardId = (
  db: Database.Database,
  cardId: string,
  excludedCardId = '',
): boolean => {
  if (db.prepare(
    'SELECT 1 FROM workshop_cards WHERE card_id = ? AND id != ?',
  ).get(cardId, excludedCardId)) return true
  const approvedVersions = db.prepare(`
    SELECT version.card_json
    FROM workshop_cards card
    JOIN workshop_card_versions version ON version.id = card.approved_version_id
    WHERE card.review_status IN ('approved', 'merged') AND card.id != ?
  `).all(excludedCardId) as Array<{ card_json: string }>
  return approvedVersions.some(
    version => parseRecord(version.card_json).id === cardId,
  )
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

const versionCardJson = (draft: WorkshopDraft): Record<string, unknown> => {
  const cardJson = { ...draft.cardJson }
  delete cardJson._draft
  return {
    ...cardJson,
    ...(draft.effectCode ? { _code: draft.effectCode } : {}),
    ...(draft.compiledCode ? { _compiled: draft.compiledCode } : {}),
  }
}

const provenanceCandidate = (value: unknown): Record<string, unknown> | null => {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (!candidate || typeof candidate.prompt !== 'string') return null
  const keys = [
    'id',
    'kind',
    'prompt',
    'provider',
    'model',
    'referenceImages',
    'seed',
    'requestId',
    'createdAt',
    'validation',
  ]
  return Object.fromEntries(
    keys
      .filter(key => candidate[key] !== undefined)
      .map(key => [key, candidate[key]]),
  )
}

const versionProvenance = (
  generation: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  ['art', 'ability'].flatMap(kind => {
    const group = generation[kind]
    if (!group || typeof group !== 'object' || Array.isArray(group)) return []
    const adopted = provenanceCandidate((group as Record<string, unknown>).adopted)
    return adopted ? [[kind, { adopted }]] : []
  }),
)

const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalise)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalise(entry)]),
  )
}

const comparableCardDefinition = (
  cardJson: Record<string, unknown>,
): unknown => {
  const comparable = { ...cardJson }
  delete comparable._draft
  delete comparable.locales
  if (
    comparable.cost
    && typeof comparable.cost === 'object'
    && !Array.isArray(comparable.cost)
    && Object.keys(comparable.cost).length === 0
  ) delete comparable.cost
  if (comparable.vp === 0) delete comparable.vp
  if (Array.isArray(comparable.desc) && comparable.desc.length === 0) delete comparable.desc
  if (Array.isArray(comparable.modifiers) && comparable.modifiers.length === 0) {
    delete comparable.modifiers
  }
  return canonicalise(comparable)
}

const hashVersionContent = (
  cardJson: Record<string, unknown>,
  codeManifest: Record<string, unknown> | null,
  artUrl: string | null,
): string => {
  const finalCardJson = { ...cardJson }
  delete finalCardJson._draft
  return createHash('sha256')
    .update(JSON.stringify(canonicalise({
      artUrl,
      cardJson: finalCardJson,
      codeManifest,
    })))
    .digest('hex')
}

const contentHash = (draft: WorkshopDraft): string => hashVersionContent(
  versionCardJson(draft),
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
    reviewStatus: isReviewStatus(row.review_status) ? row.review_status : 'unsubmitted',
    live: row.live === 1,
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
    approvedVersionId: row.approved_version_id,
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

const normaliseDraftNames = (draft: WorkshopDraft): WorkshopDraft => ({
  ...draft,
  name: draft.name.trim(),
  cardJson: {
    ...draft.cardJson,
    ...(typeof draft.cardJson.name === 'string'
      ? { name: draft.cardJson.name.trim() }
      : {}),
  },
})

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
  const draft = normaliseDraftNames(input.draft)
  validateDraft(draft)
  return db.transaction(() => {
    if (hasReservedCardId(db, draft.cardId)) {
      throw new WorkshopDraftError('conflict', 'Card id already exists')
    }
    const id = nanoid()
    const now = Date.now()
    const serialised = serialiseDraft(draft)
    db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, description,
        card_json, code_manifest, art_url, art_prompt,
        draft_generation_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.authorId,
      draft.cardId,
      draft.cardType,
      draft.name,
      draft.description,
      serialised.cardJson,
      serialised.codeManifest,
      draft.artUrl,
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
  const draft = normaliseDraftNames(input.draft)
  validateDraft(draft)
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.live) {
      throw new WorkshopDraftError(
        'conflict',
        'Card is live; unpublish it before editing',
        current,
      )
    }
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    if (hasReservedCardId(db, draft.cardId, input.cardId)) {
      throw new WorkshopDraftError('conflict', 'Card id already exists', current)
    }

    const serialised = serialiseDraft(draft)
    const keepSandboxPass = contentHash(current.draft) === contentHash(draft)
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
        sandbox_pass_version_id = ?,
        sandbox_passed_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      draft.cardId,
      draft.cardType,
      draft.name,
      draft.description,
      serialised.cardJson,
      serialised.codeManifest,
      draft.artUrl,
      serialised.generation,
      keepSandboxPass ? current.sandboxPassVersionId : null,
      keepSandboxPass ? current.sandboxPassedAt : null,
      Date.now(),
      input.cardId,
    )
    // Editing the content of an approved card voids the approval (#628):
    // the pinned snapshot no longer matches what the author intends to ship.
    if (current.reviewStatus === 'approved' && !keepSandboxPass) {
      db.prepare(`
        UPDATE workshop_cards
        SET review_status = 'stale',
            approved_commit_sha = NULL,
            approved_review_id = NULL,
            approved_at = NULL,
            approved_version_id = NULL
        WHERE id = ?
      `).run(input.cardId)
    }
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
  const cardJson = JSON.stringify(versionCardJson(workspace.draft))
  const codeManifest = workspace.draft.codeManifest
    ? JSON.stringify(workspace.draft.codeManifest)
    : null
  const provenance = JSON.stringify(versionProvenance(workspace.draft.generation))
  db.prepare(`
    INSERT INTO workshop_card_versions (
      id, card_id, card_json, code_manifest, art_url, version_number,
      created_by, created_at, content_hash, provenance_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspace.id,
    cardJson,
    codeManifest,
    workspace.draft.artUrl,
    versionNumber,
    workspace.authorId,
    Date.now(),
    hash,
    provenance,
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
      const cardJson = { ...input.candidate.cardJson }
      if (cardJson.locales === undefined && current.draft.cardJson.locales !== undefined) {
        cardJson.locales = current.draft.cardJson.locales
      }
      if (current.draft.cardJson._draft !== undefined) {
        cardJson._draft = current.draft.cardJson._draft
      } else {
        delete cardJson._draft
      }
      const cardId = cardJson.id
      const cardType = cardJson.card_type
      const name = cardJson.name
      if (
        typeof cardId !== 'string'
        || (cardType !== 'minor' && cardType !== 'occupation')
        || typeof name !== 'string'
      ) {
        throw new WorkshopDraftError('invalid', 'Ability candidate has invalid card definition')
      }
      draft = {
        ...current.draft,
        cardId,
        cardType,
        name,
        description: Array.isArray(cardJson.desc)
          ? cardJson.desc.filter((entry): entry is string => typeof entry === 'string').join(' ')
          : '',
        cardJson,
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
  if (draft.cardJson.card_type !== draft.cardType) errors.push('Card definition type does not match card type')
  if (draft.effectCode) {
    if (!draft.compiledCode || !draft.codeManifest) {
      errors.push('Ability source has not passed validation')
    } else {
      const rawSourceDefinition = draft.codeManifest.cardDefinition
      const sourceCardJson = workshopCardJsonFromDefinition(
        rawSourceDefinition
        && typeof rawSourceDefinition === 'object'
        && !Array.isArray(rawSourceDefinition)
          ? rawSourceDefinition as Record<string, unknown>
          : null,
      )
      if (!sourceCardJson) {
        errors.push('Ability source CARD_DEF is missing or invalid')
      } else if (
        JSON.stringify(comparableCardDefinition(draft.cardJson))
        !== JSON.stringify(comparableCardDefinition(sourceCardJson))
      ) {
        errors.push('Ability source CARD_DEF does not match saved card definition')
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

const handoffValidation = (
  draft: WorkshopDraft,
): { valid: boolean; errors: string[] } => {
  const validation = staticValidation(draft)
  const errors = [...validation.errors]
  if (!draft.effectCode) errors.push('Ability source is required for PR handoff')
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

const draftFromVersion = (
  current: WorkshopWorkspace,
  version: WorkshopVersionRow,
): WorkshopDraft => {
  const cardJson = parseRecord(version.card_json)
  const effectCode = typeof cardJson._code === 'string' ? cardJson._code : null
  const compiledCode = typeof cardJson._compiled === 'string' ? cardJson._compiled : null
  delete cardJson._code
  delete cardJson._compiled
  return {
    ...current.draft,
    cardId: typeof cardJson.id === 'string' ? cardJson.id : current.draft.cardId,
    cardType: cardJson.card_type === 'occupation' || cardJson.card_type === 'minor'
      ? cardJson.card_type
      : current.draft.cardType,
    name: typeof cardJson.name === 'string' ? cardJson.name : current.draft.name,
    description: Array.isArray(cardJson.desc)
      ? cardJson.desc.filter((value): value is string => typeof value === 'string').join(' ')
      : current.draft.description,
    cardJson,
    effectCode,
    compiledCode,
    codeManifest: version.code_manifest ? parseRecord(version.code_manifest) : null,
    artUrl: version.art_url,
    generation: parseRecord(version.provenance_json),
  }
}

export function loadSandboxVersion(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    versionId: string
  },
): WorkshopDraft {
  const current = loadWorkspace(db, input.cardId, input.authorId)
  return draftFromVersion(current, loadVersion(db, input.cardId, input.versionId))
}

export function loadLiveDraft(
  db: Database.Database,
  cardId: string,
): WorkshopDraft {
  const row = db.prepare(`
    SELECT * FROM workshop_cards
    WHERE id = ? AND review_status = 'approved' AND live = 1
      AND approved_version_id IS NOT NULL
  `).get(cardId) as WorkshopCardRow | undefined
  if (!row) throw new WorkshopDraftError('not_found', 'Card not found')
  const current = rowToWorkspace(row)
  return draftFromVersion(
    current,
    loadVersion(db, cardId, current.approvedVersionId!),
  )
}

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
    return checkpointDraft(db, {
      cardId: input.cardId,
      authorId: input.authorId,
      baseRevision: input.baseRevision,
      draft: draftFromVersion(current, version),
    })
  })()
}

/**
 * Enter (or refresh) review (PRD #634, #637): record that the card's review
 * PR is open and move the review axis to 'in_review'. Called by the
 * submit-review handler after the PR is created or its branch updated.
 * Re-submitting while already in_review is the "update the PR" path.
 */
export function enterReview(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    prUrl: string
    /**
     * Revision the quality gate was checked against. The PR content is
     * generated from that revision, so a concurrent checkpoint (e.g. a save
     * from another tab while the GitHub requests run) must fail the
     * transition instead of marking never-submitted content in_review.
     */
    expectedRevision: number
  },
): WorkshopWorkspace {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.expectedRevision) {
      throw new WorkshopDraftError(
        'conflict',
        'Draft changed while the review submission was in flight; re-submit',
        current,
      )
    }
    if (current.reviewStatus === 'approved' || current.reviewStatus === 'merged') {
      throw new WorkshopDraftError(
        'conflict',
        `Card is already ${current.reviewStatus}; edit the draft to restart review`,
        current,
      )
    }
    db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'in_review',
          github_pr_url = ?,
          github_pr_status = 'open',
          github_pr_last_synced_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(input.prUrl, Date.now(), Date.now(), current.id)
    return loadWorkspace(db, current.id, input.authorId)
  })()
}

/**
 * Record a passing review (PRD #634): pin the current draft as the approved
 * version and enter review_status 'approved'. This is the only doorway to
 * 'approved' — driven by the GitHub review-approval sync (#640); until that
 * lands it is exercised directly by tests.
 *
 * The caller owns the commit↔content binding: the #640 sync must verify the
 * atomic snapshot rule (#629 — approved review commit oid == PR head ==
 * content this call pins) before invoking, or reject the approval when the
 * current draft no longer matches the reviewed commit.
 */
export function approveCurrentDraft(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    commitSha?: string
    reviewId?: string
  },
): { workspace: WorkshopWorkspace; versionId: string } {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    const validation = staticValidation(current.draft)
    if (!validation.valid) {
      throw new WorkshopDraftError('not_ready', validation.errors.join('; '), current)
    }
    if (hasReservedCardId(db, current.draft.cardId, current.id)) {
      throw new WorkshopDraftError('conflict', 'Approved card id already exists', current)
    }
    const versionId = ensureVersion(db, current)
    const now = Date.now()
    db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'approved',
          approved_version_id = ?,
          approved_commit_sha = ?,
          approved_review_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(versionId, input.commitSha ?? null, input.reviewId ?? null, now, now, current.id)
    return {
      workspace: loadWorkspace(db, current.id, input.authorId),
      versionId,
    }
  })()
}

/**
 * Toggle an approved card live (PRD #634): publishing no longer snapshots the
 * draft — it only flips the live switch on the review-approved version. The
 * review gate itself (approveCurrentDraft) fills approved_version_id.
 */
export function publish(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
  },
): { workspace: WorkshopWorkspace; versionId: string } {
  // Deliberately not wrapped in one transaction: the stale downgrade below
  // must survive the thrown error (a transaction would roll it back), and the
  // synchronous better-sqlite3 driver leaves no interleaving window between
  // the checks and the final live flip.
  const current = loadWorkspace(db, input.cardId, input.authorId)
  if (current.revision !== input.baseRevision) {
    throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
  }
  if (!canGoLive(current.reviewStatus) || !current.approvedVersionId) {
    throw new WorkshopDraftError(
      'not_ready',
      'Card must pass PR review approval before it can be published',
      current,
    )
  }
  // Atomic snapshot rule (#629, #638): at the moment the card goes live the
  // approving review's commit, the PR head and the platform-pinned commit
  // must agree. Without a provider (production until #640) only the local
  // state check above applies.
  const provider = getReviewDecisionProvider()
  if (provider) {
    const row = db.prepare(
      'SELECT approved_commit_sha, github_pr_url FROM workshop_cards WHERE id = ?',
    ).get(current.id) as { approved_commit_sha: string | null; github_pr_url: string | null }
    const snapshot = provider.getSnapshot({ cardDbId: current.id, prUrl: row.github_pr_url })
    const consistent = snapshot.decision === 'approved'
      && snapshot.approvedCommitSha !== null
      && snapshot.approvedCommitSha === snapshot.headCommitSha
      && snapshot.approvedCommitSha === row.approved_commit_sha
    if (!consistent) {
      db.prepare(`
        UPDATE workshop_cards
        SET review_status = 'stale',
            live = 0,
            approved_commit_sha = NULL,
            approved_review_id = NULL,
            approved_at = NULL,
            approved_version_id = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(Date.now(), current.id)
      throw new WorkshopDraftError(
        'not_ready',
        'Review approval no longer matches the reviewed commit; re-submit for review',
        loadWorkspace(db, current.id, input.authorId),
      )
    }
  }
  db.prepare(`
    UPDATE workshop_cards SET live = 1, updated_at = ? WHERE id = ?
  `).run(Date.now(), current.id)
  return {
    workspace: loadWorkspace(db, current.id, input.authorId),
    versionId: current.approvedVersionId,
  }
}

/**
 * Pin the current draft as an immutable version without touching the review
 * axis (#638). This is the author-side version source for the sandbox
 * confirmation flow: the sandbox loads exactly this version and
 * markSandboxPass later verifies the same content hash. (The old self-publish
 * used to play this role before the PR review gate.)
 */
export function pinCurrentDraftVersion(
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
    return {
      workspace: current,
      versionId: ensureVersion(db, current),
    }
  })()
}

/**
 * Take a live card offline (PRD #634, #638). Explicit author action that does
 * NOT void the approval: an unchanged card can be re-published without
 * another review round. Running games keep their embedded snapshot; only new
 * rooms stop offering the card.
 */
export function unpublish(
  db: Database.Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
  },
): WorkshopWorkspace {
  return db.transaction(() => {
    const current = loadWorkspace(db, input.cardId, input.authorId)
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    db.prepare(`
      UPDATE workshop_cards SET live = 0, updated_at = ? WHERE id = ?
    `).run(Date.now(), current.id)
    return loadWorkspace(db, current.id, input.authorId)
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
  sandboxPassedForDraft: boolean
} {
  const current = loadWorkspace(db, cardId, authorId)
  const validation = handoffValidation(current.draft)
  const sandboxPassedForDraft = current.sandboxPassVersionId !== null
    && versionContentHash(loadVersion(db, current.id, current.sandboxPassVersionId))
      === contentHash(current.draft)
  return {
    ready: validation.valid && sandboxPassedForDraft,
    staticValidation: validation,
    sandboxPassedForDraft,
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
      card.review_status,
      card.live,
      card.approved_version_id,
      version.card_json AS version_card_json,
      version.art_url AS version_art_url,
      version.created_at AS version_created_at,
      COUNT(DISTINCT likes.user_id) AS like_count
    FROM workshop_cards card
    JOIN workshop_card_versions version ON version.id = card.approved_version_id
    LEFT JOIN users author ON author.id = card.author_id
    LEFT JOIN card_likes likes ON likes.card_id = card.id
    WHERE card.id = ? AND card.review_status = 'approved' AND card.live = 1
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
    review_status: string
    live: number
    approved_version_id: string
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
    reviewStatus: isReviewStatus(row.review_status) ? row.review_status : 'approved',
    live: row.live === 1,
    likeCount: row.like_count,
    likedByMe: viewerId
      ? Boolean(db.prepare('SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?').get(viewerId, row.id))
      : false,
    featured: row.featured,
    createdAt: row.created_at,
    updatedAt: row.version_created_at,
    approvedVersionId: row.approved_version_id,
    githubPrUrl: row.github_pr_url,
    githubPrStatus: row.github_pr_status,
    githubPrLastSyncedAt: row.github_pr_last_synced_at,
  }
}
