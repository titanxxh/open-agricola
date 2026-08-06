import { describe, expect, it } from 'vitest'
import {
  createWorkshopDraftState,
  resolveWorkshopRecovery,
  workshopDraftReducer,
  type WorkshopClientDraft,
  type WorkshopWorkspaceDto,
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

const workspace = (revision = 1, name = 'Field Keeper'): WorkshopWorkspaceDto => ({
  id: 'card-1',
  authorId: 'author',
  revision,
  status: 'draft',
  draft: draft(name),
  publishedVersionId: null,
  sandboxPassVersionId: null,
  sandboxPassedAt: null,
})

describe('workshop draft model', () => {
  it('stores and restores art inputs through the draft generation state', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, {
      type: 'sessionChanged',
      session: {
        artSubject: 'A valley carpenter',
        artPrompt: 'A carpenter working beside a river',
      },
    })

    expect(state.draft.generation).toEqual({
      art: {
        subject: 'A valley carpenter',
        prompt: 'A carpenter working beside a river',
      },
    })
    expect(state.save.status).toBe('dirty')

    const restored = createWorkshopDraftState({
      ...workspace(2),
      draft: state.draft,
    })
    expect(restored.session).toMatchObject({
      artSubject: 'A valley carpenter',
      artPrompt: 'A carpenter working beside a river',
    })
  })

  it('keeps only the three newest candidates and marks them stale after draft edits', () => {
    let state = createWorkshopDraftState(workspace())
    for (let index = 1; index <= 4; index += 1) {
      state = workshopDraftReducer(state, {
        type: 'candidateCompleted',
        candidate: {
          id: `art-${index}`,
          kind: 'art',
          prompt: `prompt ${index}`,
          resultUrl: `/card-art/${index}.png`,
          createdAt: index,
          baseRevision: 1,
          stale: false,
        },
      })
    }
    expect(state.session.artCandidates.map(candidate => candidate.id)).toEqual([
      'art-2',
      'art-3',
      'art-4',
    ])
    state = workshopDraftReducer(state, {
      type: 'sessionChanged',
      session: { sandboxTestVersionId: 'version-1' },
    })

    state = workshopDraftReducer(state, {
      type: 'draftChanged',
      draft: draft('Changed'),
    })
    expect(state.save.status).toBe('dirty')
    expect(state.session.artCandidates.every(candidate => candidate.stale)).toBe(true)
    expect(state.session.sandboxTestVersionId).toBeUndefined()
  })

  it('invalidates ability validation when candidate source is edited', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, {
      type: 'candidateCompleted',
      candidate: {
        id: 'ability-1',
        kind: 'ability',
        prompt: 'gain grain',
        sourceCode: 'const CARD_IMPL = {}',
        validation: { valid: true, errors: [] },
        createdAt: 1,
        baseRevision: 1,
        stale: false,
      },
    })
    state = workshopDraftReducer(state, {
      type: 'abilityCandidateEdited',
      candidateId: 'ability-1',
      sourceCode: 'const CARD_IMPL = { changed: true }',
    })

    expect(state.session.abilityCandidates[0]).toMatchObject({
      sourceCode: 'const CARD_IMPL = { changed: true }',
      validation: { valid: false, errors: [] },
    })
    expect(state.draft.effectCode).toBeNull()
    expect(state.draft.generation).toMatchObject({
      ability: {
        lastCompleted: {
          sourceCode: 'const CARD_IMPL = { changed: true }',
          validation: { valid: false, errors: [] },
        },
      },
    })
    expect(state.save.status).toBe('dirty')
  })

  it('records validation without adopting an ability candidate', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, {
      type: 'candidateCompleted',
      candidate: {
        id: 'ability-1',
        kind: 'ability',
        prompt: 'gain grain',
        sourceCode: 'const CARD_IMPL = {}',
        validation: { valid: false, errors: [] },
        createdAt: 1,
        baseRevision: 1,
        stale: false,
      },
    })
    state = workshopDraftReducer(state, {
      type: 'abilityCandidateValidated',
      candidateId: 'ability-1',
      validation: { valid: true, errors: [] },
    })

    expect(state.session.abilityCandidates[0]?.validation.valid).toBe(true)
    expect(state.draft.effectCode).toBeNull()
    expect(state.draft.generation).toMatchObject({
      ability: {
        lastCompleted: {
          id: 'ability-1',
          validation: { valid: true, errors: [] },
        },
      },
    })
  })

  it('clears only the adopted candidate group and accepts the server revision', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, {
      type: 'candidateCompleted',
      candidate: {
        id: 'art-1',
        kind: 'art',
        prompt: 'field',
        resultUrl: '/card-art/field.png',
        createdAt: 1,
        baseRevision: 1,
        stale: false,
      },
    })
    state = workshopDraftReducer(state, {
      type: 'candidateCompleted',
      candidate: {
        id: 'ability-1',
        kind: 'ability',
        prompt: 'grain',
        sourceCode: 'const CARD_IMPL = {}',
        validation: { valid: true, errors: [] },
        createdAt: 1,
        baseRevision: 1,
        stale: false,
      },
    })

    const adoptedWorkspace = workspace(2)
    adoptedWorkspace.draft.artUrl = '/card-art/field.png'
    state = workshopDraftReducer(state, {
      type: 'candidateAdopted',
      kind: 'art',
      workspace: adoptedWorkspace,
    })

    expect(state.baseRevision).toBe(2)
    expect(state.session.artCandidates).toEqual([])
    expect(state.session.abilityCandidates).toHaveLength(1)
    expect(state.save.status).toBe('saved')
  })

  it('restores same-revision local work and conflicts with a newer server revision', () => {
    const local = {
      baseRevision: 3,
      draft: draft('Unsynced local'),
      sessionState: {
        artCandidates: [],
        abilityCandidates: [],
        artPrompt: 'unsent art',
        abilityInput: 'unsent ability',
        abilityMessages: [],
      },
    }

    expect(resolveWorkshopRecovery(workspace(3), local)).toMatchObject({
      kind: 'local',
      state: {
        draft: { name: 'Unsynced local' },
        save: { status: 'dirty' },
        session: { artPrompt: 'unsent art' },
      },
    })
    expect(resolveWorkshopRecovery(workspace(4, 'Server changed'), local)).toMatchObject({
      kind: 'conflict',
      state: {
        conflict: {
          server: { revision: 4 },
          local: { baseRevision: 3 },
        },
      },
    })
    expect(resolveWorkshopRecovery(workspace(3), {
      ...local,
      draft: draft(),
    })).toMatchObject({ kind: 'server', clearLocal: true })
  })

  it('restores the last unadopted server candidates and image prompt', () => {
    const server = workspace(4)
    server.draft.generation = {
      art: {
        lastCompleted: {
          id: 'art-latest',
          kind: 'art',
          prompt: 'restored image prompt',
          resultUrl: '/card-art/latest.png',
          model: 'image-model',
          createdAt: 10,
        },
      },
      ability: {
        lastCompleted: {
          id: 'ability-latest',
          kind: 'ability',
          prompt: 'restored ability prompt',
          sourceCode: 'const CARD_IMPL = { restored: true }',
          model: 'ability-model',
          validation: { valid: true, errors: [] },
          createdAt: 11,
        },
      },
    }

    expect(createWorkshopDraftState(server)).toMatchObject({
      session: {
        artPrompt: 'restored image prompt',
        artCandidates: [{
          id: 'art-latest',
          baseRevision: 4,
          stale: false,
        }],
        abilityCandidates: [{
          id: 'ability-latest',
          sourceCode: 'const CARD_IMPL = { restored: true }',
          baseRevision: 4,
          stale: false,
        }],
      },
    })
  })

  it('restores a legacy image prompt even when no image completed', () => {
    const server = workspace(4)
    server.draft.generation = {
      art: { prompt: 'legacy prompt without an image' },
    }

    expect(createWorkshopDraftState(server).session.artPrompt)
      .toBe('legacy prompt without an image')
  })
})
