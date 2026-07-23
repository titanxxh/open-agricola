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
})
