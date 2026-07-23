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

export const createWorkshopDraftState = (
  workspace: WorkshopWorkspaceDto,
  session: Partial<WorkshopSessionState> = {},
): WorkshopDraftState => ({
  workspaceId: workspace.id,
  authorId: workspace.authorId,
  baseRevision: workspace.revision,
  status: workspace.status,
  draft: workspace.draft,
  publishedVersionId: workspace.publishedVersionId,
  sandboxPassVersionId: workspace.sandboxPassVersionId,
  sandboxPassedAt: workspace.sandboxPassedAt,
  stage: 'metadata',
  session: { ...emptySession(), ...session },
  save: { status: 'saved' },
  conflict: null,
})

export type WorkshopDraftAction =
  | { type: 'serverLoaded'; state: WorkshopDraftState }
  | { type: 'draftChanged'; draft: WorkshopClientDraft }
  | { type: 'candidateCompleted'; candidate: WorkshopCandidate }
  | { type: 'candidateDiscarded'; kind: WorkshopCandidate['kind']; candidateId: string }
  | { type: 'abilityCandidateEdited'; candidateId: string; sourceCode: string }
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
            session: {
              ...state.session,
              artCandidates: [...state.session.artCandidates, action.candidate].slice(-3),
              selectedArtCandidateId: action.candidate.id,
            },
          }
        : {
            ...state,
            session: {
              ...state.session,
              abilityCandidates: [...state.session.abilityCandidates, action.candidate].slice(-3),
              selectedAbilityCandidateId: action.candidate.id,
            },
          }
    case 'candidateDiscarded':
      return action.kind === 'art'
        ? {
            ...state,
            session: {
              ...state.session,
              artCandidates: state.session.artCandidates.filter(candidate => candidate.id !== action.candidateId),
              selectedArtCandidateId: state.session.selectedArtCandidateId === action.candidateId
                ? undefined
                : state.session.selectedArtCandidateId,
            },
          }
        : {
            ...state,
            session: {
              ...state.session,
              abilityCandidates: state.session.abilityCandidates.filter(candidate => candidate.id !== action.candidateId),
              selectedAbilityCandidateId: state.session.selectedAbilityCandidateId === action.candidateId
                ? undefined
                : state.session.selectedAbilityCandidateId,
            },
          }
    case 'abilityCandidateEdited':
      return {
        ...state,
        session: {
          ...state.session,
          abilityCandidates: state.session.abilityCandidates.map(candidate =>
            candidate.id === action.candidateId
              ? {
                  ...candidate,
                  sourceCode: action.sourceCode,
                  validation: { valid: false, errors: [] },
                }
              : candidate,
          ),
        },
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
