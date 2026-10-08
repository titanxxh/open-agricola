import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { WorkshopDraftErrorCode, WorkshopPinnedVersionContract } from '../../../shared/contract/workshop'
import { projectAbilityCandidate, projectWorkshopGeneration } from '../../../shared/projections/workshop-generation'
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
  cardJson?: WorkshopPinnedVersionContract['cardJson']
  error?: string
  code?: WorkshopDraftErrorCode
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

const generationGroup = (
  draft: WorkshopClientDraft,
  kind: WorkshopCandidate['kind'],
): Record<string, unknown> => {
  const group = draft.generation[kind]
  if (!group || typeof group !== 'object' || Array.isArray(group)) return {}
  return group as Record<string, unknown>
}

const generationCandidate = (
  draft: WorkshopClientDraft,
  kind: WorkshopCandidate['kind'],
): Record<string, unknown> => {
  const record = generationGroup(draft, kind)
  for (const key of kind === 'ability' ? ['lastValid', 'adopted'] : ['lastCompleted', 'adopted']) {
    const candidate = record[key]
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return record
}

const artInputsFromDraft = (draft: WorkshopClientDraft) => {
  const group = generationGroup(draft, 'art')
  return {
    artSubject: typeof group.subject === 'string' ? group.subject : '',
  }
}

const hasSessionData = (state: WorkshopDraftState): boolean => {
  const art = generationCandidate(state.draft, 'art')
  const ability = generationCandidate(state.draft, 'ability')
  const storedArtInputs = artInputsFromDraft(state.draft)
  const artCandidatesAreRecoverable = state.session.artCandidates.length <= 1
    && state.session.artCandidates.every(candidate => candidate.id === art.id)
  const abilityCandidatesAreRecoverable = state.session.abilityCandidates.length <= 1
    && state.session.abilityCandidates.every(candidate => candidate.id === ability.id)
  return !artCandidatesAreRecoverable
    || !abilityCandidatesAreRecoverable
    || (state.session.artSubject ?? '') !== storedArtInputs.artSubject
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
          body: JSON.stringify({ baseRevision, draft: { ...draft, generation: projectWorkshopGeneration(draft.generation) } }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current && payload.current.revision !== baseRevision) {
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
          errorCode: payload.code,
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
      const serverSession = createWorkshopDraftState(current.conflict.server).session
      serverState.session = {
        ...serverState.session,
        artSubject: serverSession.artSubject,
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
    const pendingSave = saveRequestRef.current
    if (pendingSave) {
      await pendingSave.promise
      current = stateRef.current
      if (!current || current.save.status === 'conflict') return false
    }
    const mergeBaseDraft = pendingSave && current.save.status === 'dirty'
      ? pendingSave.draft
      : current.draft
    const mergeBaseSession = current.session
    const artInputs = candidate.kind === 'art'
      ? {
          subject: current.session.artSubject ?? '',
        }
      : undefined
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/adopt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseRevision: current.baseRevision,
            candidate: candidate.kind === 'ability' ? projectAbilityCandidate(candidate) : candidate,
            ...(artInputs ? { artInputs } : {}),
          }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current && payload.current.revision !== current.baseRevision) {
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
          errorCode: payload.code,
        })
        return false
      }
      const latest = stateRef.current ?? current
      const adopted = workshopDraftReducer(latest, {
        type: 'candidateAdopted',
        kind: candidate.kind,
        workspace: payload.workspace,
      })
      const concurrentDraft = latest.draft !== mergeBaseDraft
      const concurrentSession = latest.session !== mergeBaseSession
      const next = concurrentDraft || concurrentSession
        ? {
            ...adopted,
            draft: mergeConcurrentEdits(mergeBaseDraft, latest.draft, adopted.draft),
            session: mergeConcurrentEdits(mergeBaseSession, latest.session, adopted.session),
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
  }, [apiFetch, cardId, dispatch, persist])

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
      if (response.status === 409 && payload.current && payload.current.revision !== current.baseRevision) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(stateRef.current ?? current),
        })
        return null
      }
      if (!response.ok || !payload.workspace || !payload.versionId) {
        // A rejected publish may have downgraded the card (e.g. stale after a
        // failed snapshot re-check) — hydrate the server state so the UI
        // reflects the new review status, but keep any edits typed while the
        // request was in flight (same merge as the success path).
        if (payload.current) {
          const latest = stateRef.current
          const applied = workshopDraftReducer(latest ?? current, {
            type: 'checkpointSaved',
            workspace: payload.current,
          })
          const next = latest && latest.draft !== current.draft
            ? {
                ...applied,
                draft: latest.draft,
                sandboxPassVersionId: latest.sandboxPassVersionId,
                sandboxPassedAt: latest.sandboxPassedAt,
                save: { status: 'dirty' as const },
              }
            : applied
          dispatch({ type: 'serverLoaded', state: next })
          persist(next)
        }
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
          errorCode: payload.code,
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

  const pinDraftVersion = useCallback(async (): Promise<WorkshopPinnedVersionContract | null> => {
    let current = stateRef.current
    if (!current || current.save.status === 'conflict') return null
    if (current.save.status !== 'saved') {
      if (!await saveDraft(current)) return null
      current = stateRef.current
      if (!current || current.save.status !== 'saved') return null
    }
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/pin-version`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision: current.baseRevision }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current && payload.current.revision !== current.baseRevision) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(stateRef.current ?? current),
        })
        return null
      }
      if (!response.ok || !payload.versionId || !isRecord(payload.cardJson)) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? (response.ok ? 'Pinned version response is missing its snapshot' : `Request failed (${response.status})`),
          errorCode: payload.code,
        })
        return null
      }
      // Edits typed while the pin request was in flight mean the returned
      // version no longer matches what the author sees — make them pin again
      // instead of sandbox-testing obsolete content.
      const latest = stateRef.current
      if (latest && latest.draft !== current.draft) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: 'Draft changed while pinning; pin the current version again',
        })
        return null
      }
      return { versionId: payload.versionId, cardJson: payload.cardJson }
    } catch (reason) {
      dispatch({
        type: 'saveFailed',
        status: 'offline',
        error: reason instanceof Error ? reason.message : String(reason),
      })
      return null
    }
  }, [apiFetch, cardId, dispatch, saveDraft])

  const unpublishDraft = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current
    if (!current) return false
    // Unpublish is the escape hatch from the live edit block, and the author
    // may arrive here from a live-save conflict. Only bypass the conflict
    // when it is the live-guard 409 (server revision has NOT advanced) — a
    // genuine concurrent checkpoint must go through normal resolution or the
    // stale local draft would silently overwrite the other tab's work.
    if (current.save.status === 'conflict'
      && current.conflict
      && current.conflict.server.revision !== current.baseRevision) {
      return false
    }
    const baseRevision = current.baseRevision
    dispatch({ type: 'saving' })
    try {
      const response = await apiFetch(
        `/api/workshop/cards/${encodeURIComponent(cardId)}/unpublish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision }),
        },
      )
      const payload = await response.json() as WorkspaceResponse
      if (response.status === 409 && payload.current && payload.current.revision !== baseRevision) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(stateRef.current ?? current),
        })
        return false
      }
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
          errorCode: payload.code,
        })
        return false
      }
      // Unpublishing is the escape hatch from the live edit block, so the
      // author may have unsaved edits right now — apply the new live state
      // without discarding the dirty local draft.
      const latest = stateRef.current
      const applied = workshopDraftReducer(latest ?? current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      // Keep the local draft when the author had unsaved edits BEFORE the
      // request (including a rejected save that motivated unpublishing)
      // or typed while it was in flight.
      const hadLocalEdits = current.save.status !== 'saved'
        || (latest !== null && latest.draft !== current.draft)
      const next = latest && hadLocalEdits
        ? {
            ...applied,
            draft: latest.draft,
            sandboxPassVersionId: latest.sandboxPassVersionId,
            sandboxPassedAt: latest.sandboxPassedAt,
            save: { status: 'dirty' as const },
          }
        : applied
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
  }, [apiFetch, cardId, dispatch])

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
      if (response.status === 409 && payload.current && payload.current.revision !== current.baseRevision) {
        dispatch({
          type: 'conflictDetected',
          server: payload.current,
          local: toLocalRecovery(stateRef.current ?? current),
        })
        return false
      }
      if (!response.ok || !payload.workspace) {
        dispatch({
          type: 'saveFailed',
          status: 'error',
          error: payload.error ?? `Request failed (${response.status})`,
          errorCode: payload.code,
        })
        return false
      }
      const restored = workshopDraftReducer(current, {
        type: 'checkpointSaved',
        workspace: payload.workspace,
      })
      restored.session = {
        ...restored.session,
        ...artInputsFromDraft(payload.workspace.draft),
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
    const undone = stateRef.current
    if (!undone) return false
    const next = {
      ...undone,
      session: {
        ...undone.session,
        ...(undone.save.status === 'saved' ? artInputsFromDraft(restoreUndoDraft) : {}),
        restoreUndoDraft: undefined,
      },
    }
    dispatch({ type: 'serverLoaded', state: next })
    persist(next)
    return true
  }, [dispatch, persist, saveDraft])

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
    unpublishDraft,
    pinDraftVersion,
    confirmSandboxPass,
    restoreVersion,
    undoRestore,
  }
}
