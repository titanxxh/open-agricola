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
  reviewStatus: 'unsubmitted',
  live: false,
  draft: draft(name),
  approvedVersionId: null,
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

  it('migrates legacy art inputs without losing a manually uploaded candidate', async () => {
    const legacyDraft = draft()
    legacyDraft.generation = {
      art: {
        prompt: 'unsent art',
        lastCompleted: {
          id: 'legacy-art',
          kind: 'art',
          prompt: 'Manually uploaded image',
          resultUrl: '/legacy.png',
          provider: 'upload',
          createdAt: 1,
        },
        adopted: {
          id: 'generated-art',
          kind: 'art',
          prompt: 'full generated prompt',
          resultUrl: '/legacy.png',
          provider: 'gemini',
          createdAt: 1,
        },
      },
    }
    localStorage.setItem(workshopDraftStorageKey('card-1'), JSON.stringify({
      baseRevision: 3,
      draft: legacyDraft,
      sessionState: {
        artCandidates: [{
          id: 'legacy-art',
          kind: 'art',
          prompt: 'Manually uploaded image',
          resultUrl: '/legacy.png',
          provider: 'upload',
          createdAt: 1,
          baseRevision: 3,
          stale: false,
        }],
        selectedArtCandidateId: 'legacy-art',
        abilityCandidates: [],
        artSubject: 'unsent subject',
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
      expect(request.draft.generation.art).toEqual({
        subject: 'unsent subject',
        lastCompleted: {
          id: 'legacy-art',
          kind: 'art',
          prompt: 'unsent subject',
          promptFormat: 'subject',
          resultUrl: '/legacy.png',
          provider: 'upload',
          createdAt: 1,
        },
      })
      const saved = workspace(4)
      saved.draft = request.draft
      return new Response(JSON.stringify({
        ok: true,
        workspace: saved,
      }))
    })

    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(3))
    expect(result.current.state?.save.status).toBe('dirty')
    expect(result.current.state?.session.artSubject).toBe('unsent subject')
    expect(result.current.state?.session.artCandidates).toEqual([
      expect.objectContaining({
        id: 'legacy-art',
        prompt: 'unsent subject',
        promptFormat: 'subject',
      }),
    ])
    expect(result.current.state?.session.selectedArtCandidateId).toBe('legacy-art')
    expect(result.current.state?.session).not.toHaveProperty('artPrompt')

    await act(async () => {
      expect(await result.current.checkpoint()).toBe(true)
    })
    expect(result.current.state?.baseRevision).toBe(4)
    expect(result.current.state?.save.status).toBe('saved')
    expect(localStorage.getItem(workshopDraftStorageKey('card-1'))).toBeNull()
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

  it('queues newer edits behind an in-flight checkpoint', async () => {
    const saves: Array<{
      body: { baseRevision: number; draft: WorkshopClientDraft }
      resolve: (response: Response) => void
    }> = []
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      const body = JSON.parse(String(init.body)) as {
        baseRevision: number
        draft: WorkshopClientDraft
      }
      return new Promise<Response>(resolve => {
        saves.push({ body, resolve })
      })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('First checkpoint')))

    let firstSave: Promise<boolean> | undefined
    let secondSave: Promise<boolean> | undefined
    act(() => {
      firstSave = result.current.checkpoint()
    })
    await waitFor(() => expect(saves).toHaveLength(1))
    act(() => {
      result.current.updateDraft(draft('Latest checkpoint'))
      secondSave = result.current.checkpoint()
    })

    saves[0]!.resolve(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(2, 'First checkpoint'),
    })))
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1]!.body).toMatchObject({
      baseRevision: 2,
      draft: { name: 'Latest checkpoint' },
    })

    saves[1]!.resolve(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(3, 'Latest checkpoint'),
    })))
    await act(async () => {
      expect(await firstSave).toBe(true)
      expect(await secondSave).toBe(true)
    })
    expect(result.current.state?.baseRevision).toBe(3)
    expect(result.current.state?.draft.name).toBe('Latest checkpoint')
    expect(result.current.state?.save.status).toBe('saved')
  })

  it('waits for an in-flight checkpoint and saves newer edits before changing stages', async () => {
    const saves: Array<{
      body: { baseRevision: number; draft: WorkshopClientDraft }
      resolve: (response: Response) => void
    }> = []
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      const body = JSON.parse(String(init.body)) as {
        baseRevision: number
        draft: WorkshopClientDraft
      }
      return new Promise<Response>(resolve => {
        saves.push({ body, resolve })
      })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))
    act(() => result.current.updateDraft(draft('First checkpoint')))

    let checkpointPromise: Promise<boolean> | undefined
    let stagePromise: Promise<boolean> | undefined
    act(() => {
      checkpointPromise = result.current.checkpoint()
    })
    await waitFor(() => expect(saves).toHaveLength(1))
    act(() => {
      stagePromise = result.current.changeStage('art')
      result.current.updateDraft(draft('Edited while saving'))
    })
    expect(result.current.state?.stage).toBe('metadata')

    saves[0]!.resolve(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(2, 'First checkpoint'),
    })))
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1]!.body).toMatchObject({
      baseRevision: 2,
      draft: { name: 'Edited while saving' },
    })
    expect(result.current.state?.stage).toBe('metadata')

    saves[1]!.resolve(new Response(JSON.stringify({
      ok: true,
      workspace: workspace(3, 'Edited while saving'),
    })))
    await act(async () => {
      expect(await checkpointPromise).toBe(true)
      expect(await stagePromise).toBe(true)
    })
    expect(result.current.state?.stage).toBe('art')
    expect(result.current.state?.save.status).toBe('saved')
  })

  it('requires whole-draft conflict choice when the server revision advanced', async () => {
    localStorage.setItem(workshopDraftStorageKey('card-1'), JSON.stringify({
      baseRevision: 2,
      draft: draft('Offline work'),
      sessionState: {
        artCandidates: [],
        abilityCandidates: [],
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

  it('uses server art inputs and marks local candidates stale when resolving a conflict', async () => {
    localStorage.setItem(workshopDraftStorageKey('card-1'), JSON.stringify({
      baseRevision: 1,
      draft: draft('Offline work'),
      sessionState: {
        artCandidates: [{
          id: 'art-1',
          kind: 'art',
          prompt: 'old prompt',
          promptFormat: 'subject',
          resultUrl: '/old.png',
          createdAt: 10,
          baseRevision: 1,
          stale: false,
        }],
        abilityCandidates: [],
        artSubject: 'local subject',
        abilityInput: '',
        abilityMessages: [],
      },
    }))
    const serverWorkspace = workspace(2, 'Server work')
    serverWorkspace.draft.generation = {
      art: { subject: 'server subject', prompt: 'server prompt' },
    }
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      workspace: serverWorkspace,
    })))
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.save.status).toBe('conflict'))

    await act(async () => {
      expect(await result.current.resolveConflict('server')).toBe(true)
    })

    expect(result.current.state?.draft.name).toBe('Server work')
    expect(result.current.state?.session.artCandidates).toEqual([
      expect.objectContaining({ id: 'art-1', stale: true }),
    ])
    expect(result.current.state?.session).toMatchObject({
      artSubject: 'server subject',
    })
    expect(result.current.state?.session).not.toHaveProperty('artPrompt')
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

  it('adopts a replacement candidate without validating the old draft source', async () => {
    const calls: { path: string; body?: Record<string, unknown> }[] = []
    const legacySource = "const CARD_IMPL = { listeners: [{ actions: ['improvement-any', 'minor-improvement'] }] }"
    const replacementSource = "const CARD_IMPL = { listeners: [{ actions: ['improvement'] }] }"
    const initial = workspace(1)
    initial.draft.effectCode = legacySource
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : undefined
      calls.push({ path, body })
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: initial }))
      }
      if (init.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Code validation failed',
          errors: ["unknown listener action 'improvement-any'"],
        }), { status: 400 })
      }
      const adopted = workspace(2)
      adopted.draft.effectCode = replacementSource
      adopted.draft.generation = {
        ability: {
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
        id: 'ability-1',
        kind: 'ability',
        prompt: 'replace legacy actions',
        sourceCode: replacementSource,
        cardJson: {
          id: 'CUSTOM_FieldKeeper',
          name: 'Field Keeper',
          card_type: 'occupation',
        },
        validation: { valid: true, errors: [] },
        createdAt: 10,
        baseRevision: 1,
        stale: false,
      },
    }))

    await act(async () => {
      expect(await result.current.adoptCandidate(
        result.current.state!.session.abilityCandidates[0]!,
      )).toBe(true)
    })

    expect(result.current.state?.draft.effectCode).toBe(replacementSource)
    expect(result.current.state?.session.abilityCandidates).toEqual([])
    expect(calls.filter(call => call.path.endsWith('/draft'))).toHaveLength(0)
    expect(calls.find(call => call.path.endsWith('/adopt'))?.body).toMatchObject({
      baseRevision: 1,
      candidate: { id: 'ability-1', sourceCode: replacementSource },
    })
    expect(localStorage.getItem(workshopDraftStorageKey('card-1'))).toBeNull()
  })

  it('includes dirty art inputs in adoption without checkpointing the whole draft', async () => {
    const requests: Array<{ path: string; method?: string; body?: Record<string, unknown> }> = []
    const candidate = {
      id: 'art-1',
      kind: 'art' as const,
      prompt: 'original prompt',
      resultUrl: '/card-art/candidate.png',
      createdAt: 10,
    }
    const initial = workspace(1)
    initial.draft.generation = {
      art: {
        subject: 'original subject',
        lastCompleted: candidate,
      },
    }
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (!init) return new Response(JSON.stringify({ ok: true, workspace: initial }))
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      requests.push({ path, method: init.method, body })
      const adopted = workspace(2)
      adopted.draft = {
        ...initial.draft,
        artUrl: candidate.resultUrl,
        generation: {
          art: {
            ...(body.artInputs as Record<string, unknown>),
            lastCompleted: body.candidate,
            adopted: body.candidate,
          },
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
    act(() => result.current.updateSession({
      artSubject: 'latest subject',
    }))

    await act(async () => {
      expect(await result.current.adoptCandidate(
        result.current.state!.session.artCandidates[0]!,
      )).toBe(true)
    })

    expect(requests).toEqual([
      expect.objectContaining({
        path: '/api/workshop/cards/card-1/adopt',
        method: 'POST',
        body: expect.objectContaining({
          artInputs: { subject: 'latest subject' },
        }),
      }),
    ])
    expect(result.current.state?.session).toMatchObject({
      artSubject: 'latest subject',
    })
  })

  it('preserves edits made while candidate adoption is in flight', async () => {
    let finishAdopt: ((response: Response) => void) | undefined
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      const body = JSON.parse(String(init.body)) as {
        draft?: WorkshopClientDraft
        candidate?: Record<string, unknown>
      }
      if (init.method === 'PUT') {
        return new Response(JSON.stringify({
          ok: true,
          workspace: {
            ...workspace(2),
            draft: body.draft,
          },
        }))
      }
      if (path.endsWith('/adopt')) {
        return new Promise<Response>(resolve => {
          finishAdopt = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
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

    let adoption: Promise<boolean> | undefined
    act(() => {
      adoption = result.current.adoptCandidate(
        result.current.state!.session.artCandidates[0]!,
      )
    })
    await waitFor(() => expect(finishAdopt).toBeTypeOf('function'))
    act(() => {
      const current = result.current.state!.draft
      result.current.updateDraft({
        ...current,
        name: 'Typed during adoption',
        cardJson: { ...current.cardJson, name: 'Typed during adoption' },
      })
    })

    const adopted = workspace(3)
    adopted.draft.artUrl = '/card-art/candidate.png'
    adopted.draft.generation = {
      art: {
        adopted: {
          id: 'art-1',
          kind: 'art',
          prompt: 'a field',
          resultUrl: '/card-art/candidate.png',
          createdAt: 10,
          baseRevision: 2,
          stale: false,
        },
      },
    }
    finishAdopt!(new Response(JSON.stringify({
      ok: true,
      workspace: adopted,
      versionId: 'version-1',
    })))

    await act(async () => {
      expect(await adoption).toBe(true)
    })
    expect(result.current.state?.draft.name).toBe('Typed during adoption')
    expect(result.current.state?.draft.artUrl).toBe('/card-art/candidate.png')
    expect(result.current.state?.session.artCandidates).toEqual([
      expect.objectContaining({ id: 'art-1', stale: true }),
    ])
    expect(result.current.state?.save.status).toBe('dirty')
  })

  it('preserves edits made while waiting for a candidate checkpoint', async () => {
    let finishSave: ((response: Response) => void) | undefined
    let finishAdopt: ((response: Response) => void) | undefined
    let savedDraft: WorkshopClientDraft | undefined
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      const body = JSON.parse(String(init.body)) as {
        draft?: WorkshopClientDraft
        candidate?: Record<string, unknown>
      }
      if (init.method === 'PUT') {
        savedDraft = body.draft
        return new Promise<Response>(resolve => {
          finishSave = resolve
        })
      }
      if (path.endsWith('/adopt')) {
        return new Promise<Response>(resolve => {
          finishAdopt = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
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

    let checkpoint: Promise<boolean> | undefined
    act(() => {
      checkpoint = result.current.checkpoint()
    })
    await waitFor(() => expect(finishSave).toBeTypeOf('function'))
    act(() => {
      const current = result.current.state!.draft
      result.current.updateDraft({
        ...current,
        name: 'Typed during checkpoint',
        cardJson: { ...current.cardJson, name: 'Typed during checkpoint' },
      })
    })

    let adoption: Promise<boolean> | undefined
    act(() => {
      adoption = result.current.adoptCandidate(
        result.current.state!.session.artCandidates[0]!,
      )
    })
    const checkpointWorkspace = workspace(2)
    checkpointWorkspace.draft = savedDraft!
    finishSave!(new Response(JSON.stringify({
      ok: true,
      workspace: checkpointWorkspace,
    })))
    await waitFor(() => expect(finishAdopt).toBeTypeOf('function'))

    const adopted = workspace(3)
    adopted.draft = {
      ...savedDraft!,
      artUrl: '/card-art/candidate.png',
      generation: {
        art: {
          adopted: {
            id: 'art-1',
            kind: 'art',
            prompt: 'a field',
            resultUrl: '/card-art/candidate.png',
            createdAt: 10,
            baseRevision: 2,
            stale: false,
          },
        },
      },
    }
    finishAdopt!(new Response(JSON.stringify({
      ok: true,
      workspace: adopted,
      versionId: 'version-1',
    })))

    await act(async () => {
      expect(await checkpoint).toBe(true)
      expect(await adoption).toBe(true)
    })
    expect(result.current.state?.draft.name).toBe('Typed during checkpoint')
    expect(result.current.state?.draft.artUrl).toBe('/card-art/candidate.png')
    expect(result.current.state?.save.status).toBe('dirty')
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
            reviewStatus: 'approved',
            live: true,
            approvedVersionId: 'version-1',
          },
          versionId: 'version-1',
        }))
      }
      return new Response(JSON.stringify({
        ok: true,
        workspace: {
          ...workspace(1),
          reviewStatus: 'approved',
          live: true,
          approvedVersionId: 'version-1',
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
    expect(result.current.state?.approvedVersionId).toBe('version-1')

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

  it('preserves edits made while a publish request is in flight', async () => {
    let finishPublish: ((response: Response) => void) | undefined
    const apiFetch = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: workspace(1) }))
      }
      return new Promise<Response>(resolve => {
        finishPublish = resolve
      })
    })
    const { result } = renderHook(() => useWorkshopDraft({
      cardId: 'card-1',
      apiFetch,
    }))
    await waitFor(() => expect(result.current.state?.baseRevision).toBe(1))

    let pendingPublish: Promise<string | null> | undefined
    act(() => {
      pendingPublish = result.current.publishDraft()
    })
    await waitFor(() => expect(result.current.state?.save.status).toBe('saving'))
    act(() => result.current.updateDraft(draft('Typed during publish')))
    finishPublish!(new Response(JSON.stringify({
      ok: true,
      workspace: {
        ...workspace(1),
        reviewStatus: 'approved',
        live: true,
        approvedVersionId: 'version-1',
      },
      versionId: 'version-1',
    })))

    await act(async () => {
      expect(await pendingPublish).toBe('version-1')
    })
    expect(result.current.state?.approvedVersionId).toBe('version-1')
    expect(result.current.state?.draft.name).toBe('Typed during publish')
    expect(result.current.state?.save.status).toBe('dirty')
    expect(localStorage.getItem(workshopDraftStorageKey('card-1')))
      .toContain('Typed during publish')
  })

  it('restores an immutable version by copy-forward and offers one local undo', async () => {
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = []
    const currentWorkspace = workspace(4, 'Current work')
    currentWorkspace.draft.generation = {
      art: { subject: 'current subject' },
    }
    const restoredWorkspace = workspace(5, 'Version one')
    restoredWorkspace.draft.generation = {
      art: { subject: 'version subject' },
    }
    const apiFetch = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : undefined
      requests.push({ path, body })
      if (!init) {
        return new Response(JSON.stringify({ ok: true, workspace: currentWorkspace }))
      }
      if (path.endsWith('/restore')) {
        return new Response(JSON.stringify({
          ok: true,
          workspace: restoredWorkspace,
        }))
      }
      const savedWorkspace = workspace(6, 'Current work')
      savedWorkspace.draft = body?.draft as WorkshopClientDraft
      return new Response(JSON.stringify({
        ok: true,
        workspace: savedWorkspace,
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
    expect(result.current.state?.session).toMatchObject({
      artSubject: 'version subject',
    })
    expect(result.current.state?.session.restoreUndoDraft?.name).toBe('Current work')
    expect(requests.find(request => request.path.endsWith('/restore'))?.body)
      .toEqual({ baseRevision: 4, versionId: 'version-1' })

    await act(async () => {
      expect(await result.current.undoRestore()).toBe(true)
    })
    expect(result.current.state?.draft.name).toBe('Current work')
    expect(result.current.state?.session).toMatchObject({
      artSubject: 'current subject',
    })
    expect(result.current.state?.session.restoreUndoDraft).toBeUndefined()
    expect(requests.find(request => request.path.endsWith('/draft'))?.body)
      .toMatchObject({ baseRevision: 5, draft: { name: 'Current work' } })
  })
})
