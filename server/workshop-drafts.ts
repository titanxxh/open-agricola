import type { PostgresDatabase as Database } from './database/postgres'
import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import type {
  WorkshopAbilityCandidateContract,
  WorkshopArtCandidateContract,
  WorkshopCardType,
  WorkshopDraftContract,
  WorkshopDraftErrorCode,
  WorkshopWorkspaceContract,
} from '../shared/contract/workshop'
import { workshopCardJsonFromDefinition } from './workshop-draft-validation.ts'
import { canGoLive, isReviewStatus, type ReviewStatus } from './workshop-status.ts'
import { getReviewDecisionProvider } from './workshop-review-provider.ts'
import { projectWorkshopGeneration, projectGenerationProvenance, projectGenerationResult } from '../shared/projections/workshop-generation.ts'

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

export type { WorkshopDraftErrorCode } from '../shared/contract/workshop'

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
  github_pr_url: string | null
  review_commit_sha: string | null
  review_version_id: string | null
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
  updated_at: number
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

export const hasReservedCardId = async (
  db: Database,
  cardId: string,
  excludedCardId = '',
): Promise<Awaited<boolean>> => {
  if ((await db.prepare(
    'SELECT 1 FROM workshop_cards WHERE card_id = ? AND id != ?',
  ).get(cardId, excludedCardId))) return true
  const approvedVersions = (await db.prepare(`
    SELECT version.card_json
    FROM workshop_cards card
    JOIN workshop_card_versions version ON version.id = card.approved_version_id
    WHERE card.review_status IN ('approved', 'merged') AND card.id != ?
  `).all(excludedCardId)) as Array<{ card_json: string }>
  return approvedVersions.some(
    version => parseRecord(version.card_json).id === cardId,
  )
}

const serialiseDraft = (draft: WorkshopDraft): {
  cardJson: string
  codeManifest: string | null
  generation: string
} => {
  const generation = projectWorkshopGeneration(draft.generation)
  const art = generation.art
  if (art && typeof art === 'object' && !Array.isArray(art)) {
    const record = art as Record<string, unknown>
    delete record.prompt
    const subject = typeof record.subject === 'string' && record.subject.trim()
      ? record.subject
      : 'Manually uploaded image'
    for (const key of ['lastCompleted', 'adopted']) {
      const candidate = record[key]
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        delete record[key]
        continue
      }
      const candidateRecord = candidate as Record<string, unknown>
      if (candidateRecord.promptFormat === 'subject' && typeof candidateRecord.prompt === 'string') {
        continue
      }
      if (candidateRecord.provider === 'upload') {
        record[key] = { ...candidateRecord, prompt: subject, promptFormat: 'subject' }
      } else delete record[key]
    }
  }
  return {
    cardJson: JSON.stringify({
      ...draft.cardJson,
      ...(draft.effectCode ? { _code: draft.effectCode } : {}),
      ...(draft.compiledCode ? { _compiled: draft.compiledCode } : {}),
    }),
    codeManifest: draft.codeManifest ? JSON.stringify(draft.codeManifest) : null,
    generation: JSON.stringify(generation),
  }
}

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
    'promptFormat',
    'provider',
    'model',
    'referenceImages',
    'seed',
    'requestId',
    'createdAt',
    'validation',
    'sourceFingerprint',
    'inputFingerprint',
  ]
  return { ...Object.fromEntries(
    keys
      .filter(key => candidate[key] !== undefined)
      .map(key => [key, candidate[key]]),
  ), ...(projectGenerationProvenance(candidate.provenance) ? { provenance: projectGenerationProvenance(candidate.provenance) } : {}) }
}

const versionProvenance = (
  generation: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  ['art', 'ability'].flatMap(kind => {
    const group = generation[kind]
    if (!group || typeof group !== 'object' || Array.isArray(group)) return []
    const record = group as Record<string, unknown>
    const adopted = provenanceCandidate(record.adopted)
    if (!adopted) return []
    return [[kind, {
      ...(kind === 'art' && typeof record.subject === 'string'
        ? { subject: record.subject }
        : {}),
      adopted,
    }]]
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
      generation: projectWorkshopGeneration(parseRecord(row.draft_generation_json)),
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

export async function loadWorkspace(
  db: Database,
  cardId: string,
  authorId: string,
): Promise<Awaited<WorkshopWorkspace>> {
  const row = (await db.prepare('SELECT * FROM workshop_cards WHERE id = ? FOR UPDATE').get(cardId)) as WorkshopCardRow | undefined
  if (!row) throw new WorkshopDraftError('not_found', 'Card not found')
  if (row.author_id !== authorId) throw new WorkshopDraftError('forbidden', 'Forbidden')
  return rowToWorkspace(row)
}

export async function createCard(
  db: Database,
  input: { authorId: string; draft: WorkshopDraft },
): Promise<Awaited<WorkshopWorkspace>> {
  const draft = normaliseDraftNames(input.draft)
  validateDraft(draft)
  return (await db.transaction(async () => {
    await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 964))').get(draft.cardId)
    if ((await hasReservedCardId(db, draft.cardId))) {
      throw new WorkshopDraftError('conflict', 'Card id already exists')
    }
    const id = nanoid()
    const now = Date.now()
    const serialised = serialiseDraft(draft)
    ;(await db.prepare(`
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
    ))
    return (await loadWorkspace(db, id, input.authorId))
  })())
}

export async function checkpointDraft(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    draft: WorkshopDraft
  },
): Promise<Awaited<WorkshopWorkspace>> {
  const draft = normaliseDraftNames(input.draft)
  validateDraft(draft)
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    if (current.reviewStatus === 'merged') {
      throw new WorkshopDraftError(
        'conflict',
        'Merged cards are read-only; contribute changes via the main repository',
        current,
      )
    }
    if (current.live) {
      throw new WorkshopDraftError(
        'live_edit_blocked',
        'Card is live; unpublish it before editing',
        current,
      )
    }
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 964))').get(draft.cardId)
    if ((await hasReservedCardId(db, draft.cardId, input.cardId))) {
      throw new WorkshopDraftError('conflict', 'Card id already exists', current)
    }

    const serialised = serialiseDraft(draft)
    const keepSandboxPass = contentHash(current.draft) === contentHash(draft)
    ;(await db.prepare(`
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
    ))
    // Editing the content of an approved card voids the approval (#628):
    // the pinned snapshot no longer matches what the author intends to ship.
    if (current.reviewStatus === 'approved' && !keepSandboxPass) {
      ;(await db.prepare(`
        UPDATE workshop_cards
        SET review_status = 'stale',
            approved_commit_sha = NULL,
            approved_review_id = NULL,
            approved_at = NULL,
            approved_version_id = NULL
        WHERE id = ?
      `).run(input.cardId))
    }
    return (await loadWorkspace(db, input.cardId, input.authorId))
  })())
}

const ensureVersion = async (
  db: Database,
  workspace: WorkshopWorkspace,
): Promise<Awaited<string>> => {
  const hash = contentHash(workspace.draft)
  const existing = (await db.prepare(`
    SELECT id FROM workshop_card_versions WHERE card_id = ? AND content_hash = ?
  `).get(workspace.id, hash)) as { id: string } | undefined
  if (existing) return existing.id

  const versionNumber = ((await db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS value
    FROM workshop_card_versions WHERE card_id = ?
  `).get(workspace.id)) as { value: number }).value
  const id = nanoid()
  const cardJson = JSON.stringify(versionCardJson(workspace.draft))
  const codeManifest = workspace.draft.codeManifest
    ? JSON.stringify(workspace.draft.codeManifest)
    : null
  const provenance = JSON.stringify(versionProvenance(workspace.draft.generation))
  ;(await db.prepare(`
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
  ))
  ;(await db.prepare(`
    DELETE FROM workshop_card_versions
    WHERE card_id = @cardId
      AND id NOT IN (
        SELECT id FROM workshop_card_versions
        WHERE card_id = @cardId
        ORDER BY version_number DESC
        LIMIT 5
      )
      AND NOT EXISTS (
        SELECT 1 FROM workshop_cards
        WHERE id = @cardId
          AND workshop_card_versions.id IN (
            review_version_id,
            approved_version_id,
            sandbox_pass_version_id
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM workshop_submissions
        WHERE version_id = workshop_card_versions.id AND state IN ('pending','blocked')
      )
  `).run({ cardId: workspace.id }))
  return id
}

export async function adoptCandidate(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    candidate: WorkshopCandidate
    artInputs?: { subject: string }
  },
): Promise<Awaited<{ workspace: WorkshopWorkspace; versionId: string }>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }

    const generation = structuredClone(current.draft.generation)
    const previous = generation[input.candidate.kind]
    const adoptedGroup: Record<string, unknown> = {
      ...(previous && typeof previous === 'object' && !Array.isArray(previous)
        ? previous as Record<string, unknown>
        : {}),
      ...(input.candidate.kind === 'art' && input.artInputs ? input.artInputs : {}),
      ...(input.candidate.kind === 'ability' ? { lastValid: input.candidate } : { lastCompleted: input.candidate }),
      adopted: input.candidate,
    }
    if (input.candidate.kind === 'ability') {
      const latestResult = projectGenerationResult(adoptedGroup.latestResult)
      if (latestResult) {
        delete latestResult.failedCandidate
        adoptedGroup.latestResult = latestResult
      }
    }
    generation[input.candidate.kind] = adoptedGroup
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
      if (
        input.candidate.cardJson.id !== current.draft.cardId
        || input.candidate.cardJson.card_type !== current.draft.cardType
        || input.candidate.cardJson.name !== current.draft.name
      ) {
        throw new WorkshopDraftError('invalid', 'Ability candidate identity does not match current card')
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
    const workspace = (await checkpointDraft(db, {
      cardId: input.cardId,
      authorId: input.authorId,
      baseRevision: input.baseRevision,
      draft,
    }))
    return { workspace, versionId: (await ensureVersion(db, workspace)) }
  })())
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

const loadVersion = async (
  db: Database,
  cardId: string,
  versionId: string,
): Promise<Awaited<WorkshopVersionRow>> => {
  const version = (await db.prepare(`
    SELECT id, card_id, card_json, code_manifest, art_url, content_hash, provenance_json
    FROM workshop_card_versions
    WHERE id = ? AND card_id = ?
  `).get(versionId, cardId)) as WorkshopVersionRow | undefined
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

export async function loadSandboxVersion(
  db: Database,
  input: {
    cardId: string
    authorId: string
    versionId: string
  },
): Promise<Awaited<WorkshopDraft>> {
  const current = (await loadWorkspace(db, input.cardId, input.authorId))
  return draftFromVersion(current, (await loadVersion(db, input.cardId, input.versionId)))
}

export async function loadLiveDraft(
  db: Database,
  cardId: string,
): Promise<Awaited<WorkshopDraft>> {
  const row = (await db.prepare(`
    SELECT * FROM workshop_cards
    WHERE id = ? AND live = 1 AND approved_version_id IS NOT NULL
      AND (review_status = 'approved' OR (review_status = 'merged' AND built_in = 0))
  `).get(cardId)) as WorkshopCardRow | undefined
  if (!row) throw new WorkshopDraftError('not_found', 'Card not found')
  const current = rowToWorkspace(row)
  return draftFromVersion(
    current,
    (await loadVersion(db, cardId, current.approvedVersionId!)),
  )
}

export async function restoreVersion(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    versionId: string
  },
): Promise<Awaited<WorkshopWorkspace>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    const version = (await loadVersion(db, input.cardId, input.versionId))
    return (await checkpointDraft(db, {
      cardId: input.cardId,
      authorId: input.authorId,
      baseRevision: input.baseRevision,
      draft: draftFromVersion(current, version),
    }))
  })())
}

/**
 * Enter (or refresh) review (PRD #634, #637): record that the card's review
 * PR is open and move the review axis to 'in_review'. Called by the
 * submit-review handler after the PR is created or its branch updated.
 * Re-submitting while already in_review is the "update the PR" path.
 */
export async function enterReview(
  db: Database,
  input: {
    cardId: string
    authorId: string
    prUrl: string
    commitSha?: string
    /**
     * Revision the quality gate was checked against. The PR content is
     * generated from that revision, so a concurrent checkpoint (e.g. a save
     * from another tab while the GitHub requests run) must fail the
     * transition instead of marking never-submitted content in_review.
     */
    expectedRevision: number
  },
): Promise<Awaited<WorkshopWorkspace>> {
  return (await db.transaction(async () => {
    await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 965))').get(input.prUrl)
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
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
    if ((await db.prepare(`
      SELECT 1 FROM workshop_cards
      WHERE github_pr_url = ?
        AND id != ?
        AND review_status IN ('approved', 'merged')
    `).get(input.prUrl, current.id))) {
      throw new WorkshopDraftError(
        'conflict',
        'PR is already bound to an approved card',
        current,
      )
    }
    const reviewVersionId = input.commitSha ? (await ensureVersion(db, current)) : null
    const now = Date.now()
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET review_status = CASE
            WHEN review_status = 'in_review' THEN 'stale'
            ELSE review_status
          END,
          live = 0,
          github_pr_url = NULL,
          github_pr_status = NULL,
          github_pr_last_synced_at = NULL,
          review_commit_sha = NULL,
          review_version_id = NULL,
          updated_at = GREATEST(updated_at + 1, ?)
      WHERE github_pr_url = ? AND id != ?
    `).run(now, input.prUrl, current.id))
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'in_review',
          approved_commit_sha = NULL, approved_version_id = NULL, approved_review_id = NULL, approved_at = NULL,
          github_pr_url = ?,
          github_pr_status = 'open',
          github_pr_last_synced_at = ?,
          review_commit_sha = ?,
          review_version_id = ?,
          updated_at = GREATEST(updated_at + 1, ?)
      WHERE id = ?
    `).run(
      input.prUrl,
      now,
      input.commitSha ?? null,
      reviewVersionId,
      now,
      current.id,
    ))
    return (await loadWorkspace(db, current.id, input.authorId))
  })())
}

export async function approveCurrentDraft(
  db: Database,
  input: {
    cardId: string
    authorId: string
    commitSha?: string
    reviewId?: string
  },
): Promise<Awaited<{ workspace: WorkshopWorkspace; versionId: string }>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    const validation = staticValidation(current.draft)
    if (!validation.valid) {
      throw new WorkshopDraftError('not_ready', validation.errors.join('; '), current)
    }
    if ((await hasReservedCardId(db, current.draft.cardId, current.id))) {
      throw new WorkshopDraftError('conflict', 'Approved card id already exists', current)
    }
    const versionId = (await ensureVersion(db, current))
    const now = Date.now()
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'approved',
          approved_version_id = ?,
          approved_commit_sha = ?,
          approved_review_id = ?,
          approved_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(versionId, input.commitSha ?? null, input.reviewId ?? null, now, now, current.id))
    return {
      workspace: (await loadWorkspace(db, current.id, input.authorId)),
      versionId,
    }
  })())
}

export async function invalidateReviewedCard(
  db: Database,
  input: {
    prUrl: string
    prStatus?: string
    preserveCommitSha?: string
    expectedBinding?: {
      id: string
      revision: number
      approvedCommitSha: string | null
      approvedVersionId: string | null
      reviewCommitSha: string | null
      reviewVersionId: string | null
      updatedAt: number
    }
  },
): Promise<Awaited<number>> {
  const now = Date.now()
  // 'stale' rows are included so a later PR-status change (e.g. the close of
  // an already-demoted retargeted PR) is still recorded on the binding.
  // Without an explicit prStatus the recorded status is preserved: callers
  // that lack a snapshot (fail-closed, approve-validation failures) must not
  // overwrite a persisted 'closed'/'merged' fact with a default.
  return (await db.prepare(`
    UPDATE workshop_cards
    SET review_status = 'stale',
        live = 0,
        github_pr_status = COALESCE(?, github_pr_status),
        github_pr_last_synced_at = ?,
        updated_at = GREATEST(updated_at + 1, ?)
    WHERE github_pr_url = ?
      AND review_status IN ('in_review', 'approved', 'stale')
      AND (CAST(? AS text) IS NULL OR review_commit_sha IS NULL OR review_commit_sha <> ?)
      AND (
        CAST(? AS text) IS NULL OR (
          id = ?
          AND draft_revision = ?
          AND approved_commit_sha IS NOT DISTINCT FROM ?
          AND approved_version_id IS NOT DISTINCT FROM ?
          AND review_commit_sha IS NOT DISTINCT FROM ?
          AND review_version_id IS NOT DISTINCT FROM ?
          AND updated_at = ?
        )
      )
  `).run(
    input.prStatus ?? null,
    now,
    now,
    input.prUrl,
    input.preserveCommitSha ?? null,
    input.preserveCommitSha ?? null,
    input.expectedBinding?.id ?? null,
    input.expectedBinding?.id ?? null,
    input.expectedBinding?.revision ?? null,
    input.expectedBinding?.approvedCommitSha ?? null,
    input.expectedBinding?.approvedVersionId ?? null,
    input.expectedBinding?.reviewCommitSha ?? null,
    input.expectedBinding?.reviewVersionId ?? null,
    input.expectedBinding?.updatedAt ?? null,
  )).changes
}

export async function approveReviewedVersion(
  db: Database,
  input: {
    prUrl: string
    commitSha: string
    reviewId: string
    expectedBinding?: {
      id: string
      reviewCommitSha: string | null
      reviewVersionId: string | null
      updatedAt: number
    }
  },
): Promise<Awaited<number>> {
  return (await db.transaction(async () => {
    const matches = (await db.prepare(`
      SELECT * FROM workshop_cards
      WHERE github_pr_url = ?
        AND (CAST(? AS text) IS NULL OR id = ?)
      LIMIT 2 FOR UPDATE
    `).all(
      input.prUrl,
      input.expectedBinding?.id ?? null,
      input.expectedBinding?.id ?? null,
    )) as WorkshopCardRow[]
    if (
      matches.length !== 1
      || !['in_review', 'stale', 'approved'].includes(matches[0]!.review_status)
    ) return 0
    const row = matches[0]!
    if (input.expectedBinding && (
      row.review_commit_sha !== input.expectedBinding.reviewCommitSha
      || row.review_version_id !== input.expectedBinding.reviewVersionId
      || row.updated_at !== input.expectedBinding.updatedAt
    )) return 0
    if (
      row.review_commit_sha !== input.commitSha
      || !row.review_version_id
    ) {
      ;(await invalidateReviewedCard(db, { prUrl: input.prUrl }))
      return 0
    }
    const current = rowToWorkspace(row)
    const reviewedVersion = (await loadVersion(db, current.id, row.review_version_id))
    if (
      contentHash(current.draft) !== versionContentHash(reviewedVersion)
      || (await hasReservedCardId(db, current.draft.cardId, current.id))
    ) {
      ;(await invalidateReviewedCard(db, { prUrl: input.prUrl }))
      return 0
    }
    const now = Date.now()
    return (await db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'approved',
          approved_version_id = ?,
          approved_commit_sha = ?,
          approved_review_id = ?,
          approved_at = ?,
          github_pr_status = 'open',
          github_pr_last_synced_at = ?,
          updated_at = GREATEST(updated_at + 1, ?)
      WHERE id = ?
    `).run(
      row.review_version_id,
      input.commitSha,
      input.reviewId,
      now,
      now,
      now,
      current.id,
    )).changes
  })())
}

export async function publish(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
    expectedUpdatedAt?: number
  },
): Promise<Awaited<{ workspace: WorkshopWorkspace; versionId: string }>> {
  // Hold the card row through validation and publication. Commit a stale
  // downgrade before reporting its error to preserve the fail-closed state.
  const outcome = await db.transaction(async () => {
  const current = (await loadWorkspace(db, input.cardId, input.authorId))
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
  const row = (await db.prepare(`
    SELECT approved_commit_sha, github_pr_url, updated_at
    FROM workshop_cards WHERE id = ?
  `).get(current.id)) as {
    approved_commit_sha: string | null
    github_pr_url: string | null
    updated_at: number
  }
  if (
    input.expectedUpdatedAt !== undefined
    && row.updated_at !== input.expectedUpdatedAt
  ) {
    throw new WorkshopDraftError(
      'conflict',
      'Card state changed while publish validation was in flight',
      current,
    )
  }
  // Atomic snapshot rule (#629, #638): at the moment the card goes live the
  // approving review's commit, the PR head and the platform-pinned commit
  // must agree. Direct aggregate callers use the provider seam;
  // the production HTTP route performs the asynchronous GitHub check first.
  const provider = getReviewDecisionProvider()
  if (provider) {
    const snapshot = provider.getSnapshot({ cardDbId: current.id, prUrl: row.github_pr_url })
    // A transient lookup failure (rate limit, outage) is not evidence of a
    // mismatch: fail retryably without touching the approval.
    if (snapshot.decision === 'unknown' || snapshot.headCommitSha === null) {
      throw new WorkshopDraftError(
        'not_ready',
        'Cannot verify the review approval right now; try again later',
        current,
      )
    }
    const consistent = snapshot.decision === 'approved'
      && snapshot.approvedCommitSha !== null
      && snapshot.approvedCommitSha === snapshot.headCommitSha
      && snapshot.approvedCommitSha === row.approved_commit_sha
    if (!consistent) {
      ;(await db.prepare(`
        UPDATE workshop_cards
        SET review_status = 'stale',
            live = 0,
            approved_commit_sha = NULL,
            approved_review_id = NULL,
            approved_at = NULL,
            approved_version_id = NULL,
            updated_at = GREATEST(updated_at + 1, ?)
        WHERE id = ?
      `).run(Date.now(), current.id))
      return new WorkshopDraftError(
        'not_ready',
        'Review approval no longer matches the reviewed commit; re-submit for review',
        (await loadWorkspace(db, current.id, input.authorId)),
      )
    }
  }
  const updated = (await db.prepare(`
    UPDATE workshop_cards
    SET live = 1, updated_at = GREATEST(updated_at + 1, ?)
    WHERE id = ? AND (CAST(? AS text) IS NULL OR updated_at = ?)
  `).run(
    Date.now(),
    current.id,
    input.expectedUpdatedAt ?? null,
    input.expectedUpdatedAt ?? null,
  ))
  if (updated.changes === 0) {
    throw new WorkshopDraftError(
      'conflict',
      'Card state changed while publish validation was in flight',
      (await loadWorkspace(db, current.id, input.authorId)),
    )
  }
  return {
    workspace: (await loadWorkspace(db, current.id, input.authorId)),
    versionId: current.approvedVersionId,
  }
  })()
  if (outcome instanceof WorkshopDraftError) throw outcome
  return outcome
}

/**
 * Pin the current draft as an immutable version without touching the review
 * axis (#638). This is the author-side version source for the sandbox
 * confirmation flow: the sandbox loads exactly this version and
 * markSandboxPass later verifies the same content hash. (The old self-publish
 * used to play this role before the PR review gate.)
 */
export async function pinCurrentDraftVersion(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
  },
): Promise<Awaited<{ workspace: WorkshopWorkspace; versionId: string }>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    const validation = staticValidation(current.draft)
    if (!validation.valid) {
      throw new WorkshopDraftError('not_ready', validation.errors.join('; '), current)
    }
    return {
      workspace: current,
      versionId: (await ensureVersion(db, current)),
    }
  })())
}

/**
 * Take a live card offline (PRD #634, #638). Explicit author action that does
 * NOT void the approval: an unchanged card can be re-published without
 * another review round. Running games keep their embedded snapshot; only new
 * rooms stop offering the card.
 */
export async function unpublish(
  db: Database,
  input: {
    cardId: string
    authorId: string
    baseRevision: number
  },
): Promise<Awaited<WorkshopWorkspace>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    if (current.reviewStatus === 'merged') {
      throw new WorkshopDraftError(
        'conflict',
        'Merged cards are managed by the main repository',
        current,
      )
    }
    if (current.revision !== input.baseRevision) {
      throw new WorkshopDraftError('conflict', 'Draft revision conflict', current)
    }
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET live = 0, updated_at = GREATEST(updated_at + 1, ?)
      WHERE id = ?
    `).run(Date.now(), current.id))
    return (await loadWorkspace(db, current.id, input.authorId))
  })())
}

/**
 * Graduation (#642, PRD #634): the review PR merged into the main repository.
 * The card enters the read-only 'merged' terminal state; a live card keeps
 * its live flag so the approved snapshot serves through the release window.
 */
export async function markCardMerged(
  db: Database,
  input: { prUrl: string },
): Promise<Awaited<number>> {
  const now = Date.now()
  return (await db.prepare(`
    UPDATE workshop_cards
    SET review_status = 'merged',
        github_pr_status = 'merged',
        github_pr_last_synced_at = ?,
        updated_at = GREATEST(updated_at + 1, ?)
    WHERE github_pr_url = ?
      AND review_status = 'approved'
      AND approved_version_id IS NOT NULL
  `).run(now, now, input.prUrl)).changes
}

/**
 * Complete graduations whose merge event arrived before the approval binding
 * (#642): the merge fact is persisted as github_pr_status='merged'; once the
 * approval lands, the next reconciliation point graduates the card.
 */
export async function reconcilePendingMerges(db: Database): Promise<Awaited<number>> {
  const rows = (await db.prepare(`
    SELECT github_pr_url FROM workshop_cards
    WHERE github_pr_status = 'merged'
      AND review_status != 'merged'
      AND approved_version_id IS NOT NULL
      AND github_pr_url IS NOT NULL
  `).all()) as Array<{ github_pr_url: string }>
  let graduated = 0
  for (const row of rows) {
    graduated += (await markCardMerged(db, { prUrl: row.github_pr_url }))
  }
  return graduated
}

/**
 * Release-window takeover (#642): at startup, flag merged cards whose card_id
 * is now present in the built-in registry. From then on rooms use the
 * built-in definition and the workshop snapshot retires (isLoadableLive).
 */
export async function markBuiltInMergedCards(
  db: Database,
  builtInCardIds: readonly string[],
): Promise<Awaited<{ flagged: number; unflagged: number }>> {
  const rows = (await db.prepare(`
    SELECT id, card_id, built_in FROM workshop_cards
    WHERE review_status = 'merged'
  `).all()) as Array<{ id: string; card_id: string; built_in: number }>
  let flagged = 0
  let unflagged = 0
  const now = Date.now()
  for (const row of rows) {
    const inRegistry = builtInCardIds.includes(row.card_id)
    // Reconcile in BOTH directions: a rollback deployment whose registry
    // does not contain the card must fall back to the workshop snapshot,
    // otherwise the card would vanish for the whole rollback window.
    const next = inRegistry ? 1 : 0
    if (row.built_in === next) continue
    ;(await db.prepare(`
      UPDATE workshop_cards SET built_in = ?, updated_at = GREATEST(updated_at + 1, ?) WHERE id = ?
    `).run(next, now, row.id))
    if (next === 1) flagged += 1
    else unflagged += 1
  }
  return { flagged, unflagged }
}

/**
 * Admin kill switch (#641, PRD #634): force a card offline and void its
 * approval regardless of author consent. Unlike the author's unpublish this
 * downgrades approved -> stale (re-publishing requires another review round).
 * Safe no-op for cards that are neither live nor approved; merged cards only
 * lose the live flag (their review axis belongs to the main repository).
 */
export async function adminTakedownCard(
  db: Database,
  cardDbId: string,
): Promise<Awaited<{ reviewStatus: string; live: boolean; removedRoomIds: string[] }>> {
  return (await db.transaction(async () => {
    const row = (await db.prepare(
      'SELECT review_status FROM workshop_cards WHERE id = ? FOR UPDATE',
    ).get(cardDbId)) as { review_status: string } | undefined
    if (!row) throw new WorkshopDraftError('not_found', 'Card not found')
    // Atomic with the card invalidation: delete every persisted room row
    // that embeds the card (exact JSON element match — LIKE would treat _
    // in nanoid ids as a wildcard). A crash can then never leave the card
    // taken down but a restorable snapshot alive, or vice versa.
    const persistedRows = (await db.prepare(`
      SELECT id FROM rooms
      WHERE EXISTS (
        SELECT 1 FROM json_array_elements_text(rooms.custom_card_ids::json) AS card(value)
        WHERE card.value = ?
      )
    `).all(cardDbId)) as Array<{ id: string }>
    const removedRoomIds = persistedRows.map((r) => r.id)
    for (const roomId of removedRoomIds) {
      ;(await db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId))
    }
    if (row.review_status === 'approved') {
      ;(await db.prepare(`
        UPDATE workshop_cards
        SET review_status = 'stale',
            live = 0,
            approved_commit_sha = NULL,
            approved_review_id = NULL,
            approved_at = NULL,
            approved_version_id = NULL,
            review_commit_sha = NULL,
            review_version_id = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(Date.now(), cardDbId))
    } else {
      // Also sever any surviving review binding: reconcileReviewSnapshot
      // accepts stale rows, so a stale GitHub approval snapshot could
      // otherwise re-approve the card without a fresh review round.
      ;(await db.prepare(`
        UPDATE workshop_cards
        SET live = 0,
            review_commit_sha = NULL,
            review_version_id = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(Date.now(), cardDbId))
    }
    const after = (await db.prepare(
      'SELECT review_status, live FROM workshop_cards WHERE id = ?',
    ).get(cardDbId)) as { review_status: string; live: number }
    return { reviewStatus: after.review_status, live: after.live === 1, removedRoomIds }
  })())
}

export async function markSandboxPass(
  db: Database,
  input: {
    cardId: string
    authorId: string
    versionId: string
    authorConfirmed: boolean
    runtimeErrors: string[]
  },
): Promise<Awaited<WorkshopWorkspace>> {
  return (await db.transaction(async () => {
    const current = (await loadWorkspace(db, input.cardId, input.authorId))
    const version = (await loadVersion(db, current.id, input.versionId))
    if (
      !input.authorConfirmed
      || input.runtimeErrors.length > 0
      || versionContentHash(version) !== contentHash(current.draft)
    ) {
      throw new WorkshopDraftError('not_ready', 'Sandbox pass must confirm the exact error-free draft version', current)
    }
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET sandbox_pass_version_id = ?, sandbox_passed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(input.versionId, Date.now(), Date.now(), current.id))
    return (await loadWorkspace(db, current.id, input.authorId))
  })())
}

export async function getHandoffReadiness(
  db: Database,
  cardId: string,
  authorId: string,
): Promise<Awaited<{
  ready: boolean
  staticValidation: { valid: boolean; errors: string[] }
  sandboxPassedForDraft: boolean
}>> {
  const current = (await loadWorkspace(db, cardId, authorId))
  const validation = handoffValidation(current.draft)
  const sandboxPassedForDraft = current.sandboxPassVersionId !== null
    && versionContentHash((await loadVersion(db, current.id, current.sandboxPassVersionId)))
      === contentHash(current.draft)
  return {
    ready: validation.valid && sandboxPassedForDraft,
    staticValidation: validation,
    sandboxPassedForDraft,
  }
}

export async function loadPublishedCard(
  db: Database,
  cardId: string,
  viewerId?: string,
): Promise<Awaited<PublishedWorkshopCard>> {
  const row = (await db.prepare(`
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
    WHERE card.id = ? AND (
      (card.review_status = 'approved' AND card.live = 1)
      OR card.review_status = 'merged'
    )
    GROUP BY card.id, version.id, author.id
  `).get(cardId)) as {
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
      ? Boolean((await db.prepare('SELECT 1 FROM card_likes WHERE user_id = ? AND card_id = ?').get(viewerId, row.id)))
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
