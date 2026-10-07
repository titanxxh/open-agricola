import { abilityDraftFingerprint, sourceFingerprint } from '../../../../shared/projections/workshop-generation'
import { describe, expect, it } from 'vitest'
import {
  createWorkshopDraftState,
  resolveWorkshopRecovery,
  workshopDraftReducer,
  toLocalRecovery,
  type AbilityCandidate,
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
  reviewStatus: 'unsubmitted',
  live: false,
  draft: draft(name),
  approvedVersionId: null,
  sandboxPassVersionId: null,
  sandboxPassedAt: null,
})

describe('workshop draft model', () => {
  it('stores and restores only the image subject through the draft generation state', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, {
      type: 'sessionChanged',
      session: {
        artSubject: 'A valley carpenter',
      },
    })

    expect(state.draft.generation).toEqual({
      art: {
        subject: 'A valley carpenter',
      },
    })
    expect(state.save.status).toBe('dirty')

    const restored = createWorkshopDraftState({
      ...workspace(2),
      draft: state.draft,
    })
    expect(restored.session).toMatchObject({
      artSubject: 'A valley carpenter',
    })
    expect(restored.session).not.toHaveProperty('artPrompt')
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
        cardJson: {},
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

    expect(state.session.abilityCandidates.find(candidate => candidate.id === state.session.selectedAbilityCandidateId)).toMatchObject({
      sourceCode: 'const CARD_IMPL = { changed: true }',
      validation: { valid: false, errors: [] },
    })
    expect(state.draft.effectCode).toBeNull()
    expect(state.draft.generation).toMatchObject({
      ability: {
        latestResult: {
          kind: 'failed-source',
          failedCandidate: { sourceCode: 'const CARD_IMPL = { changed: true }', validation: { valid: false, errors: [] } },
        },
        lastValid: { sourceCode: 'const CARD_IMPL = {}', validation: { valid: true } },
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
        cardJson: {},
        validation: { valid: false, errors: [] },
        createdAt: 1,
        baseRevision: 1,
        stale: false,
      },
    })
    state = workshopDraftReducer(state, {
      type: 'abilityCandidateValidated',
      candidateId: 'ability-1',
      sourceFingerprint: sourceFingerprint('const CARD_IMPL = {}'),
      validation: { valid: true, errors: [] },
    })

    expect(state.session.abilityCandidates[0]?.validation.valid).toBe(true)
    expect(state.draft.effectCode).toBeNull()
    expect(state.draft.generation).toMatchObject({
      ability: {
        lastValid: {
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
        cardJson: {},
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
        artSubject: 'unsent subject',
        abilityInput: 'unsent ability',
        abilityMessages: [],
      },
    }

    expect(resolveWorkshopRecovery(workspace(3), local)).toMatchObject({
      kind: 'local',
      state: {
        draft: { name: 'Unsynced local' },
        save: { status: 'dirty' },
        session: { artSubject: 'unsent subject' },
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
    })).toMatchObject({
      kind: 'local',
      clearLocal: false,
      state: {
        draft: {
          generation: {
            art: { subject: 'unsent subject' },
          },
        },
        save: { status: 'dirty' },
      },
    })
  })

  it('restores the last unadopted server candidates and image subject', () => {
    const server = workspace(4)
    server.draft.generation = {
      art: {
        subject: 'restored image subject',
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
        lastValid: {
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
        artSubject: 'restored image subject',
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

  it('does not expose a legacy saved image prompt', () => {
    const server = workspace(4)
    server.draft.generation = {
      art: { prompt: 'legacy prompt without an image' },
    }

    expect(createWorkshopDraftState(server).session).not.toHaveProperty('artPrompt')
  })
})


describe('generation result ownership and recovery', () => {
  const candidate = (id: string, valid: boolean): AbilityCandidate => ({
    id, kind: 'ability', sourceCode: `const CARD_ID = '${id}'`, cardJson: {}, prompt: 'request',
    validation: { valid, errors: valid ? [] : ['invalid'] }, createdAt: 1, baseRevision: 1, stale: false,
  })
  it('keeps a valid A through repeated failures, including cross-device recovery', () => {
    let state = createWorkshopDraftState(workspace())
    for (const item of [candidate('A', true), candidate('B', false), candidate('C', false), candidate('D', false)]) {
      state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: item })
    }
    expect(state.session.abilityCandidates.map(item => item.id)).toEqual(['A', 'C', 'D'])
    const restored = createWorkshopDraftState({ ...workspace(2), draft: state.draft })
    expect(restored.session.abilityCandidates.map(item => item.id)).toEqual(['A', 'D'])
    expect(restored.session.latestAbilityResult?.kind).toBe('failed-source')
    expect(restored.draft.effectCode).toBeNull()
  })
  it('rejects late validation after the same candidate was edited', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: candidate('A', false) })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'edited' })
    expect(workshopDraftReducer(state, { type: 'abilityCandidateValidated', candidateId: 'A',
      sourceFingerprint: sourceFingerprint(candidate('A', false).sourceCode), validation: { valid: true, errors: [] } })).toBe(state)
  })
  it('keeps ability freshness after an art edit, but rejects an old attempt or changed ability input', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: candidate('A', true) })
    const fingerprint = abilityDraftFingerprint(state.draft)
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...state.draft, artUrl: '/card-art/new.png' } })
    expect(state.session.abilityCandidates[0].stale).toBe(false)
    expect(abilityDraftFingerprint(state.draft)).toBe(fingerprint)
    state = workshopDraftReducer(state, { type: 'generationStarted', attemptId: 'new' })
    const action = { type: 'generationFinished' as const, attemptId: 'old', draftFingerprint: fingerprint,
      result: { kind: 'clarification' as const, attemptId: 'old', createdAt: 1, message: 'which round?' } }
    expect(workshopDraftReducer(state, action)).toBe(state)
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...state.draft, description: 'changed' } })
    expect(workshopDraftReducer(state, { ...action, attemptId: 'new' })).toBe(state)
  })
  it('persists an interrupted visible session, not a resumable attempt', () => {
    let state = createWorkshopDraftState(workspace())
    state = workshopDraftReducer(state, { type: 'generationStarted', attemptId: 'run' })
    state = workshopDraftReducer(state, { type: 'sessionChanged', session: { abilityMessages: [{ role: 'assistant', content: 'Reading', streaming: true, reasoning_content: 'private' }] } })
    const recovery = toLocalRecovery(state)
    expect(JSON.stringify(recovery)).not.toContain('private')
    expect(recovery.sessionState.activeAbilityAttemptId).toBeUndefined()
    expect(recovery.sessionState.latestAbilityResult?.kind).toBe('interrupted')
    expect(recovery.sessionState.abilityMessages).toEqual([{ role: 'assistant', content: 'Reading', interrupted: true }])
  })
})
