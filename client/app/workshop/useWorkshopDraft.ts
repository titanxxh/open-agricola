import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  createWorkshopDraftState,
  resolveWorkshopRecovery,
  toLocalRecovery,
  workshopDraftReducer,
  type WorkshopClientDraft,
  type WorkshopDraftAction,
  type WorkshopDraftState,
  type WorkshopLocalRecovery,
  type WorkshopCandidate,
  type WorkshopSessionState,
  type WorkshopStage,
  type WorkshopWorkspaceDto,
} from './workshop-draft-model'

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

type WorkspaceResponse = {
  ok: boolean
  workspace?: WorkshopWorkspaceDto
  current?: WorkshopWorkspaceDto
  versionId?: string
  error?: string
}

type HookAction = WorkshopDraftAction | { type: 'reset' }

const nullableReducer = (
  state: WorkshopDraftState | null,
  action: HookAction,
): WorkshopDraftState | null => {
  if (action.type === 'reset') return null
  if (action.type === 'serverLoaded') return action.state
  return state ? workshopDraftReducer(state, action) : state
}

const generationCandidate = (
  draft: WorkshopClientDraft,
  kind: WorkshopCandidate['kind'],
): Record<string, unknown> => {
  const group = draft.generation[kind]
  if (!group || typeof group !== 'object' || Array.isArray(group)) return {}
  const record = group as Record<string, unknown>
  for (const key of ['lastCompleted', 'adopted']) {
    const candidate = record[key]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return record
}

const hasSessionData = (state: WorkshopDraftState): boolean => {
  const art = generationCandidate(state.draft, 'art')
  const ability = generationCandidate(state.draft, 'ability')
  const artCandidatesAreRecoverable = state.session.artCandidates.length <= 1
    && state.session.artCandidates.every(candidate => candidate.id === art.id)
  const abilityCandidatesAreRecoverable = state.session.abilityCandidates.length <= 1
    && state.session.abilityCandidates.every(candidate => candidate.id === ability.id)
  return !artCandidatesAreRecoverable
    || !abilityCandidatesAreRecoverable
    || Boolean(state.session.artPrompt && state.session.artPrompt !== art.prompt)
    || state.session.abilityInput.length > 0
    || state.session.abilityMessages.length > 0
    || Boolean(state.session.sandboxTestVersionId)
    || Boolean(state.session.restoreUndoDraft)
}

const parseRecovery = (raw: string | null): WorkshopLocalRecovery | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as WorkshopLocalRecovery
    if (
      !Number.isInteger(parsed.baseRevision)
      || !parsed.draft
      || !parsed.sessionState
    ) return null
    return parsed
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const mergeConcurrentEdits = <T>(base: T, local: T, server: T): T => {
  if (Object.is(base, local)) return server
  if (!isRecord(base) || !isRecord(local) || !isRecord(server)) return local
  const merged: Record<string, unknown> = { ...server }
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (!(key in local)) {
      delete merged[key]
    } else if (!(key in base)) {
      merged[key] = local[key]
    } else {
      const value = mergeConcurrentEdits(base[key], local[key], server[key])
      if (value === undefined && !(key in server)) delete merged[key]
      else merged[key] = value
    }
  }
  return merged as T
}

export const workshopDraftStorageKey = (cardId: string): string =>
  `open-agricola-workshop-draft:${cardId}`

export const useWorkshopDraft = ({
  cardId,
  apiFetch,
}: {
  cardId: string
  apiFetch: ApiFetch
}) => {
  const [state, rawDispatch] = useReducer(nullableReducer, null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef<WorkshopDraftState | null>(null)
  const saveRequestRef = useRef<{
    promise: Promise<boolean>
    baseRevision: number
    draft: WorkshopClientDraft
  } | null>(null)
  const storageKey = workshopDraftStorageKey(cardId)

  const dispatch = useCallback((action: WorkshopDraftAction) => {
    stateRef.current = nullableReducer(stateRef.current, action)
    rawDispatch(action)
  }, [])

  const persist = useCallback((next: WorkshopDraftState) => {
    try {
      if (next.save.status === 'saved' && !hasSessionData(next)) {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, JSON.stringify(toLocalRecovery(next)))
      }
    } catch {
      return
    }
  }, [storageKey])

  useEffect(() => {
    let cancelled = false
    if (!cardId) {
      stateRef.current = null
      rawDispatch({ type: 'reset' })
      setLoading(false)
      setError(null)
      return
    }
    stateRef.current = null
    rawDispatch({ type: 'reset' })
    setLoading(true)
    setError(null)
    void apiFetch(`/api/workshop/cards/${encodeURIComponent(cardId)}/workspace`)
      .then(async response => {
        const payload = await response.json() as WorkspaceResponse
        if (!response.ok || !payload.workspace) {
          throw new Error(payload.error ?? `Request failed (${response.status})`)
        }
        if (cancelled) return
        const local = parseRecovery(localStorage.getItem(storageKey))
        const resolution = resolveWorkshopRecovery(payload.workspace, local)
        if (resolution.clearLocal) localStorage.removeItem(storageKey)
        dispatch({ type: 'serverLoaded', state: resolution.state })
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, cardId, dispatch, storageKey])

  useEffect(() => {
    if (state?.workspaceId === cardId) persist(state)
  }, [cardId, persist, state])

  useEffect(() => {
    const flush = () => {
      if (stateRef.current?.workspaceId === cardId) persist(stateRef.current)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [cardId, persist])

  const updateDraft = useCallback((draft: WorkshopClientDraft) => {
    dispatch({ type: 'draftChanged', draft })
  }, [dispatch])

  const updateSession = useCallback((session: Partial<WorkshopSessionState>) => {
    dispatch({ type: 'sessionChanged', session })
  }, [dispatch])

  const runSaveDraft = useCallback(async (
    current: WorkshopDraftState,
    baseRevision = current.baseRevision,
    draft = current.draft,
  ): Promise<boolean> => {
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/draft`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision, draft }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current) {
        const latest = stateRef.current ?? current
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: {
            ...toLocalRecovery(latest),
            baseRevision,
            draft: latest.draft !== current.draft ? latest.draft : draft,
          },
        })
        return false
      }
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
        })
        return false
      }
      const latest = stateRef.current
      const saved = workshopDraftReducer(latest ?? current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      const next = latest && latest.draft !== current.draft
        ? {
            ...saved,
            draft: latest.draft,
            sandboxPassVersionId: latest.sandboxPassVersionId,
            sandboxPassedAt: latest.sandboxPassedAt,
            save: { status: 'dirty' as const },
          }
        : saved
      dispatch({ type: 'serverLoaded', state: next })
      persist(next)
      return true
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return false
    }
  }, [apiFetch, cardId, dispatch, persist])

  const saveDraft = useCallback(async function enqueueSave(
    current: WorkshopDraftState,
    baseRevision = current.baseRevision,
    draft = current.draft,
  ): Promise<boolean> {
    const inFlight = saveRequestRef.current
    if (inFlight) {
      const sameRequest = inFlight.baseRevision === baseRevision && inFlight.draft === draft
      const saved = await inFlight.promise
      if (sameRequest) return saved
      const latest = stateRef.current
      if (!latest || latest.save.status === 'conflict') return false
      const explicitDraft = baseRevision !== current.baseRevision || draft !== current.draft
      return enqueueSave(
        latest,
        latest.baseRevision,
        explicitDraft ? draft : latest.draft,
      )
    }
    const promise = runSaveDraft(current, baseRevision, draft)
    const request = { promise, baseRevision, draft }
    saveRequestRef.current = request
    try {
      return await promise
    } finally {
      if (saveRequestRef.current === request) saveRequestRef.current = null
    }
  }, [runSaveDraft])

  const checkpoint = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    if (!current) return false
    if (current.save.status === 'conflict') return false
    if (current.save.status === 'saved') return true
    return saveDraft(current)
  }, [saveDraft])

  const changeStage = useCallback(async (stage: WorkshopStage): Promise<boolean> => {
    let current = stateRef.current
    if (!current || current.save.status === 'conflict') return false
    while (current.save.status !== 'saved') {
      const saved = await saveDraft(current)
      current = stateRef.current
      if (!current || current.save.status === 'conflict') return false
      if (!saved) break
    }
    dispatch({ type: 'stageChanged', stage })
    return true
  }, [dispatch, saveDraft])

  const resolveConflict = useCallback(async (
    choice: 'server' | 'local',
  ): Promise<boolean> => {
    const current = stateRef.current
    if (!current?.conflict) return false
    if (choice === 'server') {
      localStorage.removeItem(storageKey)
      const serverState = createWorkshopDraftState(
        current.conflict.server,
        current.conflict.local.sessionState,
      )
      serverState.session = {
        ...serverState.session,
        artCandidates: serverState.session.artCandidates.map(candidate => ({
          ...candidate,
          stale: true,
        })),
        abilityCandidates: serverState.session.abilityCandidates.map(candidate => ({
          ...candidate,
          stale: true,
        })),
      }
      dispatch({
        type: 'serverLoaded',
        state: serverState,
      })
      return true
    }
    const localState = {
      ...createWorkshopDraftState(
        current.conflict.server,
        current.conflict.local.sessionState,
      ),
      draft: current.conflict.local.draft,
      save: { status: 'dirty' as const },
    }
    dispatch({ type: 'serverLoaded', state: localState })
    return saveDraft(
      localState,
      current.conflict.server.revision,
      current.conflict.local.draft,
    )
  }, [dispatch, saveDraft, storageKey])

  const adoptCandidate = useCallback(async (
    candidate: WorkshopCandidate,
  ): Promise<boolean> => {
    let current = stateRef.current
    if (!current || current.save.status === 'conflict') return false
    if (current.save.status !== 'saved') {
      if (!await saveDraft(current)) return false
      current = stateRef.current
      if (!current || current.save.status !== 'saved') return false
    }
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/adopt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseRevision: current.baseRevision,
            candidate,
          }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current) {
        const latest = stateRef.current ?? current
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(latest),
        })
        return false
      }
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
        })
        return false
      }
      const latest = stateRef.current ?? current
      const adopted = workshopDraftReducer(latest, {
        type: 'candidateAdopted',
        kind: candidate.kind,
        workspace: payload.workspace,
      })
      const concurrentDraft = latest.draft !== current.draft
      const next = concurrentDraft || latest.session !== current.session
        ? {
            ...adopted,
            draft: mergeConcurrentEdits(current.draft, latest.draft, adopted.draft),
            session: mergeConcurrentEdits(current.session, latest.session, adopted.session),
            sandboxPassVersionId: concurrentDraft
              ? latest.sandboxPassVersionId
              : adopted.sandboxPassVersionId,
            sandboxPassedAt: concurrentDraft
              ? latest.sandboxPassedAt
              : adopted.sandboxPassedAt,
            save: concurrentDraft || latest.save.status === 'dirty'
              ? { status: 'dirty' as const }
              : adopted.save,
          }
        : adopted
      dispatch({ type: 'serverLoaded', state: next })
      persist(next)
      return true
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return false
    }
  }, [apiFetch, cardId, dispatch, persist, saveDraft])

  const publishDraft = useCallback(async (): Promise<string | null> => {
    let current = stateRef.current
    if (!current || current.save.status === 'conflict') return null
    if (current.save.status !== 'saved') {
      if (!await saveDraft(current)) return null
      current = stateRef.current
      if (!current || current.save.status !== 'saved') return null
    }
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision: current.baseRevision }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(current),
        })
        return null
      }
      if (!response.ok || !payload.workspace || !payload.versionId) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
        })
        return null
      }
      const latest = stateRef.current
      const published = workshopDraftReducer(latest ?? current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      const next = latest && latest.draft !== current.draft
        ? {
            ...published,
            draft: latest.draft,
            sandboxPassVersionId: latest.sandboxPassVersionId,
            sandboxPassedAt: latest.sandboxPassedAt,
            save: { status: 'dirty' as const },
          }
        : published
      dispatch({ type: 'serverLoaded', state: next })
      persist(next)
      return payload.versionId
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return null
    }
  }, [apiFetch, cardId, dispatch, persist, saveDraft])

  const confirmSandboxPass = useCallback(async (
    versionId: string,
    runtimeErrors: string[] = [],
  ): Promise<boolean> => {
    const current = stateRef.current
    if (!current || current.save.status === 'conflict') return false
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/sandbox-pass`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            versionId,
            authorConfirmed: true,
            runtimeErrors,
          }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
        })
        return false
      }
      const confirmed = workshopDraftReducer(current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      dispatch({ type: 'serverLoaded', state: confirmed })
      persist(confirmed)
      return true
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return false
    }
  }, [apiFetch, cardId, dispatch, persist])

  const restoreVersion = useCallback(async (versionId: string): Promise<boolean> => {
    let current = stateRef.current
    if (!current || current.save.status === 'conflict') return false
    if (current.save.status !== 'saved') {
      if (!await saveDraft(current)) return false
      current = stateRef.current
      if (!current || current.save.status !== 'saved') return false
    }
    const restoreUndoDraft = current.draft
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseRevision: current.baseRevision,
            versionId,
          }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(current),
        })
        return false
      }
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
        })
        return false
      }
      const restored = workshopDraftReducer(current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      restored.session = {
        ...restored.session,
        restoreUndoDraft,
        sandboxTestVersionId: undefined,
      }
      dispatch({ type: 'serverLoaded', state: restored })
      persist(restored)
      return true
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return false
    }
  }, [apiFetch, cardId, dispatch, persist, saveDraft])

  const undoRestore = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    const restoreUndoDraft = current?.session.restoreUndoDraft
    if (!current || !restoreUndoDraft || current.save.status === 'conflict') return false
    if (!await saveDraft(current, current.baseRevision, restoreUndoDraft)) return false
    dispatch({
      type: 'sessionChanged',
      session: { restoreUndoDraft: undefined },
    })
    return true
  }, [dispatch, saveDraft])

  return {
    state,
    loading,
    error,
    dispatch,
    updateDraft,
    updateSession,
    checkpoint,
    retryCheckpoint: checkpoint,
    changeStage,
    resolveConflict,
    adoptCandidate,
    publishDraft,
    confirmSandboxPass,
    restoreVersion,
    undoRestore,
  }
}
