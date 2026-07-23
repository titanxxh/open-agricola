// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  workshopDraftStorageKey,
  useWorkshopDraft,
} from '../useWorkshopDraft'
import type {
  WorkshopClientDraft,
  WorkshopWorkspaceDto,
} from '../workshop-draft-model'

const draft = (name = 'Field Keeper'): WorkshopClientDraft => ({
  cardId: 'CUSTOM_FieldKeeper',
  cardType: 'occupation',
  name,
  description: '',
  cardJson: {
    id: 'CUSTOM_FieldKeeper',
    name,
    card_type: 'occupation',
    deck: 'CUSTOM',
    number: 0,
    desc: [],
  },
  effectCode: null,
  artUrl: null,
  generation: {},
})

const workspace = (revision: number, name = 'Field Keeper'): WorkshopWorkspaceDto => ({
  id: 'card-1',
  authorId: 'author',
  revision,
  status: 'draft',
  draft: draft(name),
  publishedVersionId: null,
  sandboxPassVersionId: null,
  sandboxPassedAt: null,
})

beforeEach(() => {
  localStorage.clear()
})

describe('useWorkshopDraft', () => {
  it('stays idle until a card has been created', async () => {
    const apiFetch = vi.fn()
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: '',
      apiFetch,
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('restores same-revision local work and checkpoints the whole draft', async () => {
    localStorage.setItem(workshopDraftStorageKey('card-1'), JSON.stringify({
      baseRevision: 3,
      draft: draft('Local work'),
      sessionState: {
        artCandidates: [],
        abilityCandidates: [],
        artPrompt: 'unsent art',
        abilityInput: '',
        abilityMessages: [],
      },
    }))
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(3) }))
      }
      const request = JSON.parse(String(init.body))
      expect(request.baseRevision).toBe(3)
      expect(request.draft.name).toBe('Local work')
      return new Response(JSON.stringify({
        ok: true,
        workspace: workspace(4, 'Local work'),
      }))
    })

    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.draft.name).toBe('Local work'))
    expect(result.current.state?.save.status).toBe('dirty')
    expect(result.current.state?.session.artPrompt).toBe('unsent art')

    await act(async () => {
      expect(await result.current.checkpoint()).toBe(true)
    })
    expect(result.current.state?.baseRevision).toBe(4)
    expect(result.current.state?.save.status).toBe('saved')
    expect(JSON.parse(localStorage.getItem(workshopDraftStorageKey('card-1'))!).baseRevision).toBe(4)
  })

  it('preserves edits made while a checkpoint request is in flight', async () => {
    let finishSave: ((response: Response) => void) | undefined
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Promise<Response>(resolve => {
        finishSave = resolve
      })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('Checkpoint snapshot')))

    let pendingSave: Promise<boolean> | undefined
    act(() => {
      pendingSave = result.current.checkpoint()
    })
    await waitFor(() => expect(result.current.state?.save.status).toBe('saving'))
    act(() => result.current.updateDraft(draft('Typed during save')))
    finishSave!(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(2, 'Checkpoint snapshot'),
    })))

    await act(async () => {
      expect(await pendingSave).toBe(true)
    })
    expect(result.current.state?.baseRevision).toBe(2)
    expect(result.current.state?.draft.name).toBe('Typed during save')
    expect(result.current.state?.save.status).toBe('dirty')
    expect(localStorage.getItem(workshopDraftStorageKey('card-1')))
      .toContain('Typed during save')
  })

  it('preserves edits made while a checkpoint conflict is in flight', async () => {
    let finishSave: ((response: Response) => void) | undefined
    const saveBodies: Array<{ baseRevision: number; draft: WorkshopClientDraft }> = []
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      const body = JSON.parse(String(init.body)) as {
        baseRevision: number
        draft: WorkshopClientDraft
      }
      saveBodies.push(body)
      if (saveBodies.length === 1) {
        return new Promise<Response>(resolve => {
          finishSave = resolve
        })
      }
      return new Response(JSON.stringify({
        ok: true,
        workspace: workspace(3, body.draft.name),
      }))
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('Checkpoint snapshot')))

    let pendingSave: Promise<boolean> | undefined
    act(() => {
      pendingSave = result.current.checkpoint()
    })
    await waitFor(() => expect(result.current.state?.save.status).toBe('saving'))
    act(() => result.current.updateDraft(draft('Typed during conflict')))
    finishSave!(new Response(JSON.stringify({
      ok: false,
      current: workspace(2, 'Server work'),
    }), { status: 409 }))

    await act(async () => {
      expect(await pendingSave).toBe(false)
    })
    expect(result.current.state?.conflict?.local.draft.name).toBe('Typed during conflict')

    await act(async () => {
      expect(await result.current.resolveConflict('local')).toBe(true)
    })
    expect(saveBodies[1]).toMatchObject({
      baseRevision: 2,
      draft: { name: 'Typed during conflict' },
    })
    expect(result.current.state?.draft.name).toBe('Typed during conflict')
  })

  it('reuses an in-flight checkpoint instead of issuing a duplicate PUT', async () => {
    const finishSaves: Array<(response: Response) => void> = []
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Promise<Response>(resolve => {
        finishSaves.push(resolve)
      })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('One checkpoint')))

    let firstSave: Promise<boolean> | undefined
    let secondSave: Promise<boolean> | undefined
    act(() => {
      firstSave = result.current.checkpoint()
      secondSave = result.current.checkpoint()
    })
    await waitFor(() => expect(finishSaves.length).toBeGreaterThan(0))
    finishSaves[0]!(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(2, 'One checkpoint'),
    })))
    if (finishSaves[1]) {
      finishSaves[1](new Response(JSON.stringify({
        ok: false,
        current: workspace(2, 'One checkpoint'),
      }), { status: 409 }))
    }

    await act(async () => {
      expect(await firstSave).toBe(true)
      expect(await secondSave).toBe(true)
    })
    expect(finishSaves).toHaveLength(1)
    expect(result.current.state?.save.status).toBe('saved')
  })

  it('requires whole-draft conflict choice when the server revision advanced', async () => {
    localStorage.setItem(workshopDraftStorageKey('card-1'), JSON.stringify({
      baseRevision: 2,
      draft: draft('Offline work'),
      sessionState: {
        artCandidates: [],
        abilityCandidates: [],
        artPrompt: '',
        abilityInput: '',
        abilityMessages: [],
      },
    }))
    const apiFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, workspace: workspace(3, 'Server work') })),
    )

    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.save.status).toBe('conflict'))
    expect(result.current.state?.conflict?.server.revision).toBe(3)
    expect(result.current.state?.conflict?.local.draft.name).toBe('Offline work')
  })

  it('keeps the local draft when a checkpoint receives 409', async () => {
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Response(JSON.stringify({
        ok: false,
        current: workspace(2, 'Server work'),
      }), { status: 409 })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('Local work')))

    await act(async () => {
      expect(await result.current.checkpoint()).toBe(false)
    })
    expect(result.current.state?.save.status).toBe('conflict')
    expect(result.current.state?.conflict?.server.draft.name).toBe('Server work')
    expect(result.current.state?.conflict?.local.draft.name).toBe('Local work')
  })

  it('keeps stage navigation available when a checkpoint fails', async () => {
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Response(JSON.stringify({
        ok: false,
        error: 'deterministic save failure',
      }), { status: 503 })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('Unsynced work')))

    await act(async () => {
      expect(await result.current.changeStage('art')).toBe(true)
    })

    expect(result.current.state?.stage).toBe('art')
    expect(result.current.state?.save).toEqual({
      status: 'error',
      error: 'deterministic save failure',
    })
    expect(localStorage.getItem(workshopDraftStorageKey('card-1'))).toContain('Unsynced work')
  })

  it('stops stage navigation when a checkpoint detects a revision conflict', async () => {
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Response(JSON.stringify({
        ok: false,
        current: workspace(2, 'Server work'),
      }), { status: 409 })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('Conflicting work')))

    await act(async () => {
      expect(await result.current.changeStage('art')).toBe(false)
    })

    expect(result.current.state?.stage).toBe('metadata')
    expect(result.current.state?.save.status).toBe('conflict')
  })

  it('checkpoints provenance before adopting a candidate', async () => {
    const calls: { path: string; body?: Record<string, unknown> }[] = []
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : undefined
      calls.push({ path, body })
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      if (init.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: true,
          workspace: {
            ...workspace(2),
            draft: body?.draft,
          },
        }))
      }
      const adopted = workspace(3)
      adopted.draft.artUrl = '/card-art/candidate.png'
      adopted.draft.generation = {
        art: {
          lastCompleted: body?.candidate,
          adopted: body?.candidate,
        },
      }
      return new Response(JSON.stringify({
        ok: true,
        workspace: adopted,
        versionId: 'version-1',
      }))
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.dispatch({
      type: 'candidateCompleted',
      candidate: {
        id: 'art-1',
        kind: 'art',
        prompt: 'a field',
        resultUrl: '/card-art/candidate.png',
        createdAt: 10,
        baseRevision: 1,
        stale: false,
      },
    }))

    await act(async () => {
      expect(await result.current.adoptCandidate(
        result.current.state!.session.artCandidates[0]!,
      )).toBe(true)
    })

    expect(result.current.state?.draft.artUrl).toBe('/card-art/candidate.png')
    expect(result.current.state?.session.artCandidates).toEqual([])
    expect(calls.filter(call => call.path.endsWith('/draft'))).toHaveLength(1)
    expect(calls.find(call => call.path.endsWith('/adopt'))?.body).toMatchObject({
      baseRevision: 2,
      candidate: { id: 'art-1', prompt: 'a field' },
    })
    expect(localStorage.getItem(workshopDraftStorageKey('card-1'))).toBeNull()
  })

  it('publishes and confirms the same immutable sandbox version', async () => {
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = []
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : undefined
      requests.push({ path, body })
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      if (path.endsWith('/publish')) {
        return new Response(JSON.stringify({
          ok: true,
          workspace: {
            ...workspace(1),
            status: 'published',
            publishedVersionId: 'version-1',
          },
          versionId: 'version-1',
        }))
      }
      return new Response(JSON.stringify({
        ok: true,
        workspace: {
          ...workspace(1),
          status: 'published',
          publishedVersionId: 'version-1',
          sandboxPassVersionId: 'version-1',
          sandboxPassedAt: 100,
        },
      }))
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))

    let versionId: string | null = null
    await act(async () => {
      versionId = await result.current.publishDraft()
    })
    expect(versionId).toBe('version-1')
    expect(result.current.state?.publishedVersionId).toBe('version-1')

    await act(async () => {
      expect(await result.current.confirmSandboxPass('version-1')).toBe(true)
    })
    expect(result.current.state?.sandboxPassVersionId).toBe('version-1')
    expect(requests.find(request => request.path.endsWith('/publish'))?.body)
      .toEqual({ baseRevision: 1 })
    expect(requests.find(request => request.path.endsWith('/sandbox-pass'))?.body)
      .toEqual({
        versionId: 'version-1',
        authorConfirmed: true,
        runtimeErrors: [],
      })
  })

  it('restores an immutable version by copy-forward and offers one local undo', async () => {
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = []
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : undefined
      requests.push({ path, body })
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(4, 'Current work') }))
      }
      if (path.endsWith('/restore')) {
        return new Response(JSON.stringify({
          ok: true,
          workspace: workspace(5, 'Version one'),
        }))
      }
      return new Response(JSON.stringify({
        ok: true,
        workspace: workspace(6, 'Current work'),
      }))
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(4))

    await act(async () => {
      expect(await result.current.restoreVersion('version-1')).toBe(true)
    })
    expect(result.current.state?.draft.name).toBe('Version one')
    expect(result.current.state?.session.restoreUndoDraft?.name).toBe('Current work')
    expect(requests.find(request => request.path.endsWith('/restore'))?.body)
      .toEqual({ baseRevision: 4, versionId: 'version-1' })

    await act(async () => {
      expect(await result.current.undoRestore()).toBe(true)
    })
    expect(result.current.state?.draft.name).toBe('Current work')
    expect(result.current.state?.session.restoreUndoDraft).toBeUndefined()
    expect(requests.find(request => request.path.endsWith('/draft'))?.body)
      .toMatchObject({ baseRevision: 5, draft: { name: 'Current work' } })
  })
})
