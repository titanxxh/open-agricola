export type WorkshopClientDraft = {
  cardId: string
  cardType: 'minor' | 'occupation'
  name: string
  description: string
  cardJson: Record<string, unknown>
  effectCode: string | null
  compiledCode?: string | null
  codeManifest?: Record<string, unknown> | null
  artUrl: string | null
  generation: Record<string, unknown>
}

export type WorkshopWorkspaceDto = {
  id: string
  authorId: string
  revision: number
  status: string
  draft: WorkshopClientDraft
  publishedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
}

type CandidateBase = {
  id: string
  prompt: string
  createdAt: number
  baseRevision: number
  stale: boolean
  provider?: string
  model?: string
}

export type ArtCandidate = CandidateBase & {
  kind: 'art'
  resultUrl: string
  referenceImages?: string[]
}

export type AbilityCandidate = CandidateBase & {
  kind: 'ability'
  sourceCode: string
  validation: { valid: boolean; errors: string[] }
}

export type WorkshopCandidate = ArtCandidate | AbilityCandidate
export type WorkshopStage = 'metadata' | 'art' | 'ability' | 'localization' | 'validation'
export type WorkshopSaveStatus = 'saved' | 'dirty' | 'saving' | 'offline' | 'error' | 'conflict'

export type WorkshopSessionState = {
  artCandidates: ArtCandidate[]
  abilityCandidates: AbilityCandidate[]
  artPrompt: string
  abilityInput: string
  abilityMessages: unknown[]
  selectedArtCandidateId?: string
  selectedAbilityCandidateId?: string
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
  status: string
  draft: WorkshopClientDraft
  publishedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
  stage: WorkshopStage
  session: WorkshopSessionState
  save: { status: WorkshopSaveStatus; error?: string }
  conflict: {
    server: WorkshopWorkspaceDto
    local: WorkshopLocalRecovery
  } | null
}

const emptySession = (): WorkshopSessionState => ({
  artCandidates: [],
  abilityCandidates: [],
  artPrompt: '',
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
      ...(Array.isArray(candidate.referenceImages)
        ? {
            referenceImages: candidate.referenceImages.filter(
              (entry): entry is string => typeof entry === 'string',
            ),
          }
        : {}),
    }
  }
  if (kind === 'ability' && typeof candidate.sourceCode === 'string') {
    const validation = asRecord(candidate.validation)
    return {
      ...common,
      kind,
      sourceCode: candidate.sourceCode,
      validation: {
        valid: validation.valid === true,
        errors: Array.isArray(validation.errors)
          ? validation.errors.filter((entry): entry is string => typeof entry === 'string')
          : [],
      },
    }
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
  const lastAbility = candidateFromGeneration('ability', ability.lastCompleted, workspace.revision)
  const adoptedAbility = candidateFromGeneration('ability', ability.adopted, workspace.revision)
  const pendingArt = lastArt?.id === adoptedArt?.id ? null : lastArt
  const pendingAbility = lastAbility?.id === adoptedAbility?.id ? null : lastAbility
  return {
    ...emptySession(),
    artPrompt: lastArt?.prompt ?? (typeof art.prompt === 'string' ? art.prompt : ''),
    artCandidates: pendingArt?.kind === 'art' ? [pendingArt] : [],
    abilityCandidates: pendingAbility?.kind === 'ability' ? [pendingAbility] : [],
    ...(pendingArt ? { selectedArtCandidateId: pendingArt.id } : {}),
    ...(pendingAbility ? { selectedAbilityCandidateId: pendingAbility.id } : {}),
  }
}

const withLastCompleted = (
  draft: WorkshopClientDraft,
  kind: WorkshopCandidate['kind'],
  candidate: WorkshopCandidate | null,
): WorkshopClientDraft => {
  const generation = { ...draft.generation }
  const group = { ...asRecord(generation[kind]) }
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

export const createWorkshopDraftState = (
  workspace: WorkshopWorkspaceDto,
  session: Partial<WorkshopSessionState> = {},
): WorkshopDraftState => {
  const restoredSession = sessionFromGeneration(workspace)
  return {
    workspaceId: workspace.id,
    authorId: workspace.authorId,
    baseRevision: workspace.revision,
    status: workspace.status,
    draft: workspace.draft,
    publishedVersionId: workspace.publishedVersionId,
    sandboxPassVersionId: workspace.sandboxPassVersionId,
    sandboxPassedAt: workspace.sandboxPassedAt,
    stage: 'metadata',
    session: { ...restoredSession, ...session },
    save: { status: 'saved' },
    conflict: null,
  }
}

export type WorkshopDraftAction =
  | { type: 'serverLoaded'; state: WorkshopDraftState }
  | { type: 'draftChanged'; draft: WorkshopClientDraft }
  | { type: 'candidateCompleted'; candidate: WorkshopCandidate }
  | { type: 'candidateDiscarded'; kind: WorkshopCandidate['kind']; candidateId: string }
  | { type: 'abilityCandidateEdited'; candidateId: string; sourceCode: string }
  | {
      type: 'abilityCandidateValidated'
      candidateId: string
      validation: AbilityCandidate['validation']
    }
  | { type: 'candidateAdopted'; kind: WorkshopCandidate['kind']; workspace: WorkshopWorkspaceDto }
  | { type: 'sessionChanged'; session: Partial<WorkshopSessionState> }
  | { type: 'stageChanged'; stage: WorkshopStage }
  | { type: 'saving' }
  | { type: 'saveFailed'; status: 'offline' | 'error'; error: string }
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
  status: workspace.status,
  draft: workspace.draft,
  publishedVersionId: workspace.publishedVersionId,
  sandboxPassVersionId: workspace.sandboxPassVersionId,
  sandboxPassedAt: workspace.sandboxPassedAt,
  save: { status: 'saved' },
  conflict: null,
})

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
          abilityCandidates: staleCandidates(state.session.abilityCandidates),
        },
        sandboxPassVersionId: null,
        sandboxPassedAt: null,
        save: { status: 'dirty' },
      }
    case 'candidateCompleted':
      return action.candidate.kind === 'art'
        ? {
            ...state,
            draft: withLastCompleted(state.draft, 'art', action.candidate),
            session: {
              ...state.session,
              artCandidates: [...state.session.artCandidates, action.candidate].slice(-3),
              artPrompt: action.candidate.prompt,
              selectedArtCandidateId: action.candidate.id,
            },
            save: { status: 'dirty' },
          }
        : {
            ...state,
            draft: withLastCompleted(state.draft, 'ability', action.candidate),
            session: {
              ...state.session,
              abilityCandidates: [...state.session.abilityCandidates, action.candidate].slice(-3),
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
      return {
        ...state,
        draft: withLastCompleted(state.draft, 'ability', remaining.at(-1) ?? null),
        session: {
          ...state.session,
          abilityCandidates: remaining,
          selectedAbilityCandidateId: state.session.selectedAbilityCandidateId === action.candidateId
            ? remaining.at(-1)?.id
            : state.session.selectedAbilityCandidateId,
        },
        save: { status: 'dirty' },
      }
    }
    case 'abilityCandidateEdited': {
      const candidates = state.session.abilityCandidates.map(candidate =>
        candidate.id === action.candidateId
          ? {
              ...candidate,
              sourceCode: action.sourceCode,
              validation: { valid: false, errors: [] },
            }
          : candidate,
      )
      const edited = candidates.find(candidate => candidate.id === action.candidateId) ?? null
      return {
        ...state,
        draft: withLastCompleted(state.draft, 'ability', edited),
        session: { ...state.session, abilityCandidates: candidates },
        save: { status: 'dirty' },
      }
    }
    case 'abilityCandidateValidated': {
      const candidates = state.session.abilityCandidates.map(candidate =>
        candidate.id === action.candidateId
          ? { ...candidate, validation: action.validation }
          : candidate,
      )
      const validated = candidates.find(candidate => candidate.id === action.candidateId) ?? null
      return {
        ...state,
        draft: withLastCompleted(state.draft, 'ability', validated),
        session: { ...state.session, abilityCandidates: candidates },
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
            }
          : {
              ...next.session,
              abilityCandidates: [],
              selectedAbilityCandidateId: undefined,
            },
      }
    }
    case 'sessionChanged':
      return { ...state, session: { ...state.session, ...action.session } }
    case 'stageChanged':
      return { ...state, stage: action.stage }
    case 'saving':
      return { ...state, save: { status: 'saving' } }
    case 'saveFailed':
      return { ...state, save: { status: action.status, error: action.error } }
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

export const toLocalRecovery = (state: WorkshopDraftState): WorkshopLocalRecovery => ({
  baseRevision: state.baseRevision,
  draft: state.draft,
  sessionState: state.session,
})

export const resolveWorkshopRecovery = (
  server: WorkshopWorkspaceDto,
  local?: WorkshopLocalRecovery | null,
):
  | { kind: 'server'; state: WorkshopDraftState; clearLocal: boolean }
  | { kind: 'local'; state: WorkshopDraftState; clearLocal: false }
  | { kind: 'conflict'; state: WorkshopDraftState; clearLocal: false } => {
  const serverState = createWorkshopDraftState(server, local?.sessionState)
  if (!local) return { kind: 'server', state: serverState, clearLocal: false }
  if (local.baseRevision !== server.revision) {
    return {
      kind: 'conflict',
      state: {
        ...serverState,
        save: { status: 'conflict' },
        conflict: { server, local },
      },
      clearLocal: false,
    }
  }
  if (JSON.stringify(local.draft) === JSON.stringify(server.draft)) {
    return { kind: 'server', state: serverState, clearLocal: true }
  }
  return {
    kind: 'local',
    state: {
      ...serverState,
      draft: local.draft,
      session: local.sessionState,
      save: { status: 'dirty' },
    },
    clearLocal: false,
  }
}
