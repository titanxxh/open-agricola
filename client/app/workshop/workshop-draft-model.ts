import { abilityDraftFingerprint, projectAbilityCandidate, projectGenerationResult, projectWorkshopGeneration, projectVisibleMessages, sourceFingerprint } from '../../../shared/projections/workshop-generation'
import type { GenerationResult } from '../../../shared/contract/workshop-generation'
import type {
  WorkshopAbilityCandidateContract,
  WorkshopArtCandidateContract,
  WorkshopDraftContract,
  WorkshopDraftErrorCode,
  WorkshopWorkspaceContract,
} from '../../../shared/contract/workshop'

export type WorkshopClientDraft = WorkshopDraftContract
export type WorkshopWorkspaceDto = WorkshopWorkspaceContract

type CandidateState = {
  createdAt: number
  baseRevision: number
  stale: boolean
}

export type ArtCandidate = WorkshopArtCandidateContract & CandidateState

export type AbilityCandidate = WorkshopAbilityCandidateContract & CandidateState & {
  validation: { valid: boolean; errors: string[] }
}

export type WorkshopCandidate = ArtCandidate | AbilityCandidate
export type WorkshopStage = 'metadata' | 'art' | 'ability' | 'localization' | 'validation'
export type WorkshopSaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict'

export type WorkshopSessionState = {
  artCandidates: ArtCandidate[]
  abilityCandidates: AbilityCandidate[]
  artSubject?: string
  abilityInput: string
  abilityMessages: unknown[]
  latestAbilityResult?: GenerationResult
  activeAbilityAttemptId?: string
  activeAbilityValidationId?: string
  selectedArtCandidateId?: string
  selectedAbilityCandidateId?: string
  sandboxTestVersionId?: string
  restoreUndoDraft?: WorkshopClientDraft
}

export type WorkshopLocalRecovery = {
  baseRevision: number
  draft: WorkshopClientDraft
  sessionState: WorkshopSessionState
}

export type WorkshopDraftState = {
  workspaceId: string
  authorId: string
  baseRevision: number
  reviewStatus: WorkshopWorkspaceContract['reviewStatus']
  live: boolean
  draft: WorkshopClientDraft
  approvedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
  stage: WorkshopStage
  session: WorkshopSessionState
  save: { status: WorkshopSaveStatus; error?: string; errorCode?: WorkshopDraftErrorCode; savedAt?: number }
  conflict: {
    server: WorkshopWorkspaceDto
    local: WorkshopLocalRecovery
  } | null
}

const emptySession = (): WorkshopSessionState => ({
  artCandidates: [],
  abilityCandidates: [],
  artSubject: '',
  abilityInput: '',
  abilityMessages: [],
})

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

const candidateFromGeneration = (
  kind: WorkshopCandidate['kind'],
  value: unknown,
  revision: number,
): WorkshopCandidate | null => {
  const candidate = asRecord(value)
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.prompt !== 'string'
    || typeof candidate.createdAt !== 'number'
  ) return null
  const common = {
    id: candidate.id,
    prompt: candidate.prompt,
    createdAt: candidate.createdAt,
    baseRevision: typeof candidate.baseRevision === 'number'
      ? candidate.baseRevision
      : revision,
    stale: candidate.stale === true,
    ...(typeof candidate.provider === 'string' ? { provider: candidate.provider } : {}),
    ...(typeof candidate.model === 'string' ? { model: candidate.model } : {}),
  }
  if (kind === 'art' && typeof candidate.resultUrl === 'string') {
    return {
      ...common,
      kind,
      resultUrl: candidate.resultUrl,
      ...(candidate.promptFormat === 'subject' ? { promptFormat: 'subject' as const } : {}),
      ...(Array.isArray(candidate.referenceImages)
        ? {
            referenceImages: candidate.referenceImages.filter(
              (entry): entry is string => typeof entry === 'string',
            ),
          }
        : {}),
    }
  }
  if (kind === 'ability') {
    const projected = projectAbilityCandidate(candidate)
    if (projected) return { ...common, ...projected, validation: { ...projected.validation, errors: projected.validation.errors ?? [] } }
  }
  return null
}

const sessionFromGeneration = (
  workspace: WorkshopWorkspaceDto,
): WorkshopSessionState => {
  const art = asRecord(workspace.draft.generation.art)
  const ability = asRecord(workspace.draft.generation.ability)
  const lastArt = candidateFromGeneration('art', art.lastCompleted, workspace.revision)
  const adoptedArt = candidateFromGeneration('art', art.adopted, workspace.revision)
  const lastAbility = candidateFromGeneration('ability', ability.lastValid, workspace.revision)
  const adoptedAbility = asRecord(ability.adopted)
  const pendingArt = lastArt?.id === adoptedArt?.id ? null : lastArt
  const pendingAbility = lastAbility?.id === adoptedAbility.id && lastAbility?.kind === 'ability' && lastAbility.sourceFingerprint === adoptedAbility.sourceFingerprint ? null : lastAbility
  const latestResult = projectGenerationResult(ability.latestResult)
  const failed = candidateFromGeneration('ability', latestResult?.failedCandidate, workspace.revision)
  const abilityCandidates = [pendingAbility, failed].filter((candidate): candidate is AbilityCandidate => candidate?.kind === 'ability')
  return {
    ...emptySession(),
    artSubject: typeof art.subject === 'string' ? art.subject : '',
    artCandidates: pendingArt?.kind === 'art' ? [pendingArt] : [],
    abilityCandidates,
    latestAbilityResult: latestResult,
    ...(pendingArt ? { selectedArtCandidateId: pendingArt.id } : {}),
    ...(abilityCandidates.length ? { selectedAbilityCandidateId: abilityCandidates.at(-1)!.id } : {}),
  }
}

const withLastCompleted = (
  draft: WorkshopClientDraft,
  kind: WorkshopCandidate['kind'],
  candidate: WorkshopCandidate | null,
): WorkshopClientDraft => {
  const generation = { ...draft.generation }
  const group = { ...asRecord(generation[kind]) }
  if (kind === 'ability') {
    if (candidate?.kind === 'ability') {
      const projected = projectAbilityCandidate(candidate)!
      if (projected.validation.valid) group.lastValid = projected
      group.latestResult = resultFromCandidate(projected)
    } else {
      delete group.latestResult
    }
    delete group.lastCompleted
    generation.ability = group
    return { ...draft, generation: projectWorkshopGeneration(generation) }
  }
  if (candidate) {
    group.lastCompleted = candidate
  } else if (group.adopted) {
    group.lastCompleted = group.adopted
  } else {
    delete group.lastCompleted
  }
  generation[kind] = group
  return { ...draft, generation }
}

const resultFromCandidate = (candidate: WorkshopAbilityCandidateContract): GenerationResult => ({
  kind: candidate.validation.valid ? 'candidate' : 'failed-source',
  attemptId: candidate.provenance?.attemptId ?? candidate.id, createdAt: candidate.createdAt, message: '',
  ...(candidate.provenance ? { provenance: candidate.provenance } : {}),
  candidateId: candidate.id, sourceFingerprint: sourceFingerprint(candidate.sourceCode),
  ...(!candidate.validation.valid ? { failedCandidate: candidate } : {}),
})

const keepAbilityCandidates = (candidates: AbilityCandidate[]): AbilityCandidate[] => {
  const newest = candidates.slice(-3)
  const valid = [...candidates].reverse().find(candidate => candidate.validation.valid)
  return valid && !newest.includes(valid) ? [valid, ...newest.slice(-2)] : newest
}

export const createWorkshopDraftState = (
  workspace: WorkshopWorkspaceDto,
  session: Partial<WorkshopSessionState> = {},
): WorkshopDraftState => {
  const restoredSession = sessionFromGeneration(workspace)
  return {
    workspaceId: workspace.id,
    authorId: workspace.authorId,
    baseRevision: workspace.revision,
    reviewStatus: workspace.reviewStatus,
    live: workspace.live,
    draft: workspace.draft,
    approvedVersionId: workspace.approvedVersionId,
    sandboxPassVersionId: workspace.sandboxPassVersionId,
    sandboxPassedAt: workspace.sandboxPassedAt,
    stage: 'metadata',
    session: { ...restoredSession, ...session },
    save: { status: 'saved', savedAt: Date.now() },
    conflict: null,
  }
}

export type WorkshopDraftAction =
  | { type: 'serverLoaded'; state: WorkshopDraftState }
  | { type: 'draftChanged'; draft: WorkshopClientDraft }
  | { type: 'candidateCompleted'; candidate: WorkshopCandidate }
  | { type: 'generationStarted'; attemptId: string }
  | { type: 'generationInvalidated'; attemptId: string }
  | { type: 'abilityValidationStarted'; validationId: string }
  | { type: 'abilityValidationEnded'; validationId: string }
  | { type: 'generationFinished'; attemptId: string; draftFingerprint: string; sourceCandidate?: { id: string; fingerprint: string }; result: GenerationResult; candidate?: AbilityCandidate }
  | { type: 'candidateDiscarded'; kind: WorkshopCandidate['kind']; candidateId: string }
  | {
      type: 'abilityCandidateEdited'
      candidateId: string
      sourceCode: string
      cardJson?: Record<string, unknown>
    }
  | {
      type: 'abilityCandidateValidated'
      validationId: string
      candidateId: string
      sourceFingerprint: string
      validation: AbilityCandidate['validation']
      cardJson?: Record<string, unknown>
    }
  | { type: 'candidateAdopted'; kind: WorkshopCandidate['kind']; workspace: WorkshopWorkspaceDto }
  | { type: 'sessionChanged'; session: Partial<WorkshopSessionState> }
  | { type: 'stageChanged'; stage: WorkshopStage }
  | { type: 'saving' }
  | { type: 'saveFailed'; status: 'offline' | 'error'; error: string; errorCode?: WorkshopDraftErrorCode }
  | { type: 'checkpointSaved'; workspace: WorkshopWorkspaceDto }
  | {
      type: 'conflictDetected'
      server: WorkshopWorkspaceDto
      local: WorkshopLocalRecovery
    }

const staleCandidates = <T extends WorkshopCandidate>(candidates: T[]): T[] =>
  candidates.map(candidate => ({ ...candidate, stale: true }))

const applyWorkspace = (
  state: WorkshopDraftState,
  workspace: WorkshopWorkspaceDto,
): WorkshopDraftState => ({
  ...state,
  workspaceId: workspace.id,
  authorId: workspace.authorId,
  baseRevision: workspace.revision,
  reviewStatus: workspace.reviewStatus,
  live: workspace.live,
  draft: workspace.draft,
  approvedVersionId: workspace.approvedVersionId,
  sandboxPassVersionId: workspace.sandboxPassVersionId,
  sandboxPassedAt: workspace.sandboxPassedAt,
  save: { status: 'saved', savedAt: Date.now() },
  conflict: null,
})

export function isCurrentAbilityAttempt(state: WorkshopDraftState, attempt: {
  attemptId: string; draftFingerprint: string; sourceCandidate?: { id: string; fingerprint: string }
}): boolean {
  return state.session.activeAbilityAttemptId === attempt.attemptId
    && abilityDraftFingerprint(state.draft) === attempt.draftFingerprint
    && (!attempt.sourceCandidate || state.session.abilityCandidates.some(candidate =>
      candidate.id === attempt.sourceCandidate!.id && sourceFingerprint(candidate.sourceCode) === attempt.sourceCandidate!.fingerprint))
}

export const workshopDraftReducer = (
  state: WorkshopDraftState,
  action: WorkshopDraftAction,
): WorkshopDraftState => {
  switch (action.type) {
    case 'serverLoaded':
      return action.state
    case 'draftChanged':
      return {
        ...state,
        draft: action.draft,
        session: {
          ...state.session,
          artCandidates: staleCandidates(state.session.artCandidates),
          activeAbilityAttemptId: abilityDraftFingerprint(state.draft) === abilityDraftFingerprint(action.draft)
            ? state.session.activeAbilityAttemptId : undefined,
          activeAbilityValidationId: abilityDraftFingerprint(state.draft) === abilityDraftFingerprint(action.draft)
            ? state.session.activeAbilityValidationId : undefined,
          abilityCandidates: abilityDraftFingerprint(state.draft) === abilityDraftFingerprint(action.draft)
            ? state.session.abilityCandidates
            : staleCandidates(state.session.abilityCandidates),
          sandboxTestVersionId: undefined,
          restoreUndoDraft: undefined,
        },
        sandboxPassVersionId: null,
        sandboxPassedAt: null,
        save: { status: 'dirty' },
      }
    case 'generationStarted':
      return { ...state, session: { ...state.session, activeAbilityAttemptId: action.attemptId, activeAbilityValidationId: undefined } }
    case 'abilityValidationStarted':
      return { ...state, session: { ...state.session, activeAbilityValidationId: action.validationId } }
    case 'abilityValidationEnded':
      return state.session.activeAbilityValidationId === action.validationId
        ? { ...state, session: { ...state.session, activeAbilityValidationId: undefined } }
        : state
    case 'generationInvalidated':
      return state.session.activeAbilityAttemptId === action.attemptId
        ? { ...state, session: { ...state.session, activeAbilityAttemptId: undefined } }
        : state
    case 'generationFinished': {
      if (state.session.activeAbilityAttemptId !== action.attemptId) return state
      if (!isCurrentAbilityAttempt(state, action)) {
        return { ...state, session: { ...state.session, activeAbilityAttemptId: undefined } }
      }
      const next = action.candidate ? workshopDraftReducer(state, { type: 'candidateCompleted', candidate: action.candidate }) : state
      return {
        ...next,
        draft: { ...next.draft, generation: projectWorkshopGeneration({ ...next.draft.generation, ability: { ...asRecord(next.draft.generation.ability), latestResult: action.result } }) },
        session: { ...next.session, latestAbilityResult: action.result, activeAbilityAttemptId: undefined },
        save: { status: 'dirty' },
      }
    }
    case 'candidateCompleted':
      return action.candidate.kind === 'art'
        ? {
            ...state,
            draft: withLastCompleted(state.draft, 'art', action.candidate),
            session: {
              ...state.session,
              artCandidates: [...state.session.artCandidates, action.candidate].slice(-3),
              selectedArtCandidateId: action.candidate.id,
            },
            save: { status: 'dirty' },
          }
        : {
            ...state,
            draft: withLastCompleted(state.draft, 'ability', action.candidate),
            session: {
              ...state.session,
              abilityCandidates: keepAbilityCandidates([...state.session.abilityCandidates, action.candidate]),
              activeAbilityValidationId: undefined,
              latestAbilityResult: resultFromCandidate(action.candidate),
              selectedAbilityCandidateId: action.candidate.id,
            },
            save: { status: 'dirty' },
          }
    case 'candidateDiscarded': {
      if (action.kind === 'art') {
        const remaining = state.session.artCandidates.filter(
          candidate => candidate.id !== action.candidateId,
        )
        return {
          ...state,
          draft: withLastCompleted(state.draft, 'art', remaining.at(-1) ?? null),
          session: {
            ...state.session,
            artCandidates: remaining,
            selectedArtCandidateId: state.session.selectedArtCandidateId === action.candidateId
              ? remaining.at(-1)?.id
              : state.session.selectedArtCandidateId,
          },
          save: { status: 'dirty' },
        }
      }
      const remaining = state.session.abilityCandidates.filter(
        candidate => candidate.id !== action.candidateId,
      )
      const ability = { ...asRecord(state.draft.generation.ability) }
      if (asRecord(ability.lastValid).id === action.candidateId) {
        const fallback = [...remaining].reverse().find(candidate => candidate.validation.valid)
        if (fallback) ability.lastValid = fallback
        else delete ability.lastValid
      }
      return {
        ...state,
        draft: withLastCompleted({ ...state.draft, generation: { ...state.draft.generation, ability } }, 'ability', remaining.at(-1) ?? null),
        session: {
          ...state.session,
          abilityCandidates: remaining,
          activeAbilityValidationId: undefined,
          selectedAbilityCandidateId: state.session.selectedAbilityCandidateId === action.candidateId
            ? remaining.at(-1)?.id
            : state.session.selectedAbilityCandidateId,
        },
        save: { status: 'dirty' },
      }
    }
    case 'abilityCandidateEdited': {
      const previous = state.session.abilityCandidates.find(candidate => candidate.id === action.candidateId)
      if (!previous) return state
      const editedId = `${action.candidateId.split(':edit:')[0]}:edit:${sourceFingerprint(action.sourceCode).slice(0, 16)}`
      const edited: AbilityCandidate = {
        ...previous,
        id: editedId,
        sourceCode: action.sourceCode,
        sourceFingerprint: sourceFingerprint(action.sourceCode),
        ...(action.cardJson ? { cardJson: action.cardJson } : {}),
        validation: { valid: false, errors: [] },
      }
      const candidates = state.session.abilityCandidates.filter(candidate =>
        candidate.id !== editedId && (candidate.id !== previous.id || previous.validation.valid))
      candidates.push(edited)
      return {
        ...state,
        draft: withLastCompleted(state.draft, 'ability', edited),
        session: { ...state.session, activeAbilityAttemptId: undefined, activeAbilityValidationId: undefined, abilityCandidates: keepAbilityCandidates(candidates), selectedAbilityCandidateId: editedId, latestAbilityResult: resultFromCandidate(edited) },
        save: { status: 'dirty' },
      }
    }
    case 'abilityCandidateValidated': {
      if (state.session.activeAbilityValidationId !== action.validationId) return state
      if (!state.session.abilityCandidates.some(candidate => candidate.id === action.candidateId && sourceFingerprint(candidate.sourceCode) === action.sourceFingerprint)) return state
      const candidates = state.session.abilityCandidates.map(candidate =>
        candidate.id === action.candidateId
          ? { ...candidate, ...(action.cardJson ? { cardJson: action.cardJson } : {}), validation: { ...action.validation, sourceFingerprint: action.sourceFingerprint } }
          : candidate,
      )
      const validated = candidates.find(candidate => candidate.id === action.candidateId) ?? null
      return {
        ...state,
        draft: withLastCompleted(state.draft, 'ability', validated),
        session: { ...state.session, activeAbilityValidationId: undefined, abilityCandidates: candidates, latestAbilityResult: validated ? resultFromCandidate(validated) : undefined },
        save: { status: 'dirty' },
      }
    }
    case 'candidateAdopted': {
      const next = applyWorkspace(state, action.workspace)
      return {
        ...next,
        session: action.kind === 'art'
          ? {
              ...next.session,
              artCandidates: [],
              selectedArtCandidateId: undefined,
              sandboxTestVersionId: undefined,
              restoreUndoDraft: undefined,
            }
          : {
              ...next.session,
              abilityCandidates: [],
              activeAbilityValidationId: undefined,
              selectedAbilityCandidateId: undefined,
              sandboxTestVersionId: undefined,
              restoreUndoDraft: undefined,
            },
      }
    }
    case 'sessionChanged': {
      const session = { ...state.session, ...action.session }
      if (action.session.artSubject === undefined) {
        return { ...state, session }
      }
      const art = { ...asRecord(state.draft.generation.art) }
      delete art.prompt
      art.subject = action.session.artSubject
      return {
        ...state,
        draft: {
          ...state.draft,
          generation: { ...state.draft.generation, art },
        },
        session,
        save: { status: 'dirty' },
      }
    }
    case 'stageChanged':
      return { ...state, stage: action.stage }
    case 'saving':
      return { ...state, save: { status: 'saving' } }
    case 'saveFailed':
      return {
        ...state,
        save: {
          status: action.status,
          error: action.error,
          ...(action.errorCode ? { errorCode: action.errorCode } : {}),
        },
      }
    case 'checkpointSaved':
      return applyWorkspace(state, action.workspace)
    case 'conflictDetected':
      return {
        ...state,
        save: { status: 'conflict' },
        conflict: { server: action.server, local: action.local },
      }
  }
}

const projectSessionRecovery = (session: WorkshopSessionState): WorkshopSessionState => ({
  artCandidates: session.artCandidates.map(candidate => candidateFromGeneration('art', candidate, candidate.baseRevision)).filter((candidate): candidate is ArtCandidate => candidate?.kind === 'art'),
  abilityCandidates: session.abilityCandidates.map(candidate => candidateFromGeneration('ability', candidate, candidate.baseRevision)).filter((candidate): candidate is AbilityCandidate => candidate?.kind === 'ability'),
  artSubject: session.artSubject, abilityInput: session.abilityInput,
  abilityMessages: projectVisibleMessages(session.abilityMessages),
  latestAbilityResult: session.activeAbilityAttemptId
    ? { kind: 'interrupted', attemptId: session.activeAbilityAttemptId, createdAt: Date.now(), message: 'Generation interrupted by page reload; start a new attempt to continue.' }
    : projectGenerationResult(session.latestAbilityResult),
  selectedArtCandidateId: session.selectedArtCandidateId, selectedAbilityCandidateId: session.selectedAbilityCandidateId,
  sandboxTestVersionId: session.sandboxTestVersionId,
  ...(session.restoreUndoDraft ? { restoreUndoDraft: { ...session.restoreUndoDraft, generation: projectWorkshopGeneration(session.restoreUndoDraft.generation) } } : {}),
})

export const toLocalRecovery = (state: WorkshopDraftState): WorkshopLocalRecovery => ({
  baseRevision: state.baseRevision,
  draft: { ...state.draft, generation: projectWorkshopGeneration(state.draft.generation) },
  sessionState: projectSessionRecovery(state.session),
})

const migrateRecoveredArtInputs = (
  server: WorkshopWorkspaceDto,
  local: WorkshopLocalRecovery,
): WorkshopLocalRecovery => {
  const stored = sessionFromGeneration({ ...server, draft: local.draft })
  const subjectChanged = typeof local.sessionState.artSubject === 'string'
    && local.sessionState.artSubject !== stored.artSubject
  const art = { ...asRecord(local.draft.generation.art) }
  const sessionState = { ...local.sessionState } as WorkshopSessionState & { artPrompt?: unknown }
  const hadPrompt = Object.hasOwn(art, 'prompt') || Object.hasOwn(sessionState, 'artPrompt')
  const hasLegacyCandidate = ['lastCompleted', 'adopted'].some(
    key => art[key] !== undefined && asRecord(art[key]).promptFormat !== 'subject',
  )
  const hasLegacySessionCandidate = sessionState.artCandidates.some(
    candidate => candidate.promptFormat !== 'subject',
  )
  delete art.prompt
  delete sessionState.artPrompt
  if (hadPrompt || hasLegacyCandidate || hasLegacySessionCandidate) {
    const subject = typeof sessionState.artSubject === 'string' && sessionState.artSubject.trim()
      ? sessionState.artSubject
      : 'Manually uploaded image'
    for (const key of ['lastCompleted', 'adopted']) {
      const candidate = asRecord(art[key])
      if (candidate.promptFormat === 'subject') continue
      if (candidate.provider === 'upload') {
        art[key] = { ...candidate, prompt: subject, promptFormat: 'subject' }
      } else delete art[key]
    }
    sessionState.artCandidates = sessionState.artCandidates
      .filter(candidate => candidate.promptFormat === 'subject' || candidate.provider === 'upload')
      .map(candidate => candidate.promptFormat === 'subject'
        ? candidate
        : { ...candidate, prompt: subject, promptFormat: 'subject' })
    if (!sessionState.artCandidates.some(
      candidate => candidate.id === sessionState.selectedArtCandidateId,
    )) delete sessionState.selectedArtCandidateId
  }
  if (!subjectChanged && !hadPrompt && !hasLegacyCandidate && !hasLegacySessionCandidate) return local
  if (subjectChanged) art.subject = local.sessionState.artSubject
  return {
    ...local,
    draft: {
      ...local.draft,
      generation: { ...local.draft.generation, art },
    },
    sessionState,
  }
}

export const resolveWorkshopRecovery = (
  server: WorkshopWorkspaceDto,
  local?: WorkshopLocalRecovery | null,
):
  | { kind: 'server'; state: WorkshopDraftState; clearLocal: boolean }
  | { kind: 'local'; state: WorkshopDraftState; clearLocal: false }
  | { kind: 'conflict'; state: WorkshopDraftState; clearLocal: false } => {
  const migrated = local ? migrateRecoveredArtInputs(server, local) : null
  const recovered = migrated ? { ...migrated, draft: { ...migrated.draft, generation: projectWorkshopGeneration(migrated.draft.generation) }, sessionState: projectSessionRecovery(migrated.sessionState) } : null
  const serverState = createWorkshopDraftState(server, recovered?.sessionState)
  if (!recovered) return { kind: 'server', state: serverState, clearLocal: false }
  if (recovered.baseRevision !== server.revision) {
    return {
      kind: 'conflict',
      state: {
        ...serverState,
        save: { status: 'conflict' },
        conflict: { server, local: recovered },
      },
      clearLocal: false,
    }
  }
  if (JSON.stringify(recovered.draft) === JSON.stringify(server.draft)) {
    return { kind: 'server', state: serverState, clearLocal: true }
  }
  return {
    kind: 'local',
    state: {
      ...serverState,
      draft: recovered.draft,
      session: recovered.sessionState,
      save: { status: 'dirty' },
    },
    clearLocal: false,
  }
}
