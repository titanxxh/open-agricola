import { abilityDraftFingerprint, projectWorkshopGeneration, sourceFingerprint } from '../../../../shared/projections/workshop-generation'
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
    state = workshopDraftReducer(state, { type: 'abilityValidationStarted', validationId: 'validate' })
    state = workshopDraftReducer(state, {
      type: 'abilityCandidateValidated', validationId: 'validate',
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
  it.each([true, false])('retains pending candidate age after a draft edit, checkpoint and reload (valid: %s)', valid => {
    let state = workshopDraftReducer(createWorkshopDraftState(workspace()), { type: 'candidateCompleted', candidate: candidate('A', valid) })
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: {
      id: 'art-A', kind: 'art', prompt: 'field', promptFormat: 'subject', resultUrl: '/card-art/a.png', createdAt: 1, baseRevision: 1, stale: false,
    } })
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...state.draft, description: 'Newer rules' } })
    const saved = { ...workspace(2), draft: { ...state.draft, generation: projectWorkshopGeneration(state.draft.generation) } }
    state = workshopDraftReducer(state, { type: 'checkpointSaved', workspace: saved })
    const reloaded = createWorkshopDraftState(saved)
    expect(reloaded.draft.description).toBe('Newer rules')
    expect(reloaded.session.abilityCandidates[0]).toMatchObject({ baseRevision: 1, stale: true })
    expect(reloaded.session.artCandidates[0]).toMatchObject({ baseRevision: 1, stale: true })
    expect(state.session.abilityCandidates[0].stale).toBe(true)
  })
  it('keeps a fresh ability candidate fresh when only checkpointing or changing artwork', () => {
    let state = workshopDraftReducer(createWorkshopDraftState(workspace()), { type: 'candidateCompleted', candidate: candidate('A', true) })
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...state.draft, artUrl: '/card-art/new.png' } })
    const restored = createWorkshopDraftState({ ...workspace(2), draft: { ...state.draft, generation: projectWorkshopGeneration(state.draft.generation) } })
    expect(restored.session.abilityCandidates[0]).toMatchObject({ baseRevision: 1, stale: false })
  })
  it('does not restore an earlier successful validation after the same candidate fails revalidation', () => {
    const original = candidate('A', true)
    let state = workshopDraftReducer(createWorkshopDraftState(workspace()), { type: 'candidateCompleted', candidate: original })
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...state.draft, name: 'Changed identity' } })
    state = workshopDraftReducer(state, { type: 'abilityValidationStarted', validationId: 'revalidate' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateValidated', validationId: 'revalidate', candidateId: 'A',
      sourceFingerprint: sourceFingerprint(original.sourceCode), validation: { valid: false, errors: ['Card identity changed'] } })
    const restored = createWorkshopDraftState({ ...workspace(2), draft: state.draft })
    expect(restored.session.abilityCandidates).toHaveLength(1)
    expect(restored.session.abilityCandidates.find(item => item.id === restored.session.selectedAbilityCandidateId)?.validation.valid).toBe(false)
  })
  it('clears failed source from local recovery when adopting another candidate', () => {
    const a = candidate('A', true)
    let state = workshopDraftReducer(createWorkshopDraftState(workspace()), { type: 'candidateCompleted', candidate: a })
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: candidate('B', false) })
    const adopted = { ...workspace(2), draft: { ...state.draft, effectCode: a.sourceCode,
      generation: { ability: { adopted: a, latestResult: { kind: 'failed-source', attemptId: 'B', createdAt: 2, message: 'invalid' } } },
    } }
    state = workshopDraftReducer(state, { type: 'candidateAdopted', kind: 'ability', workspace: adopted })
    expect(state.session.abilityCandidates).toEqual([])
    expect(toLocalRecovery(state).sessionState.latestAbilityResult).not.toHaveProperty('failedCandidate')
    expect(createWorkshopDraftState(adopted).session.abilityCandidates).toEqual([])
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
    state = workshopDraftReducer(state, { type: 'abilityValidationStarted', validationId: 'validate' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'edited' })
    expect(workshopDraftReducer(state, { type: 'abilityCandidateValidated', validationId: 'validate', candidateId: 'A',
      sourceFingerprint: sourceFingerprint(candidate('A', false).sourceCode), validation: { valid: true, errors: [] } })).toBe(state)
  })
  it('does not attribute a manually edited source to the original generation attempt', () => {
    const original = candidate('A', true)
    original.provider = 'deepseek'
    original.model = 'deepseek-flash'
    original.inputFingerprint = 'input-A'
    original.provenance = {
      attemptId: 'generated-A', inputFingerprint: 'input-A', sourceFingerprint: sourceFingerprint(original.sourceCode),
      promptVersion: 'prompt', toolVersion: 'tools', provider: 'deepseek', endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-flash',
      modelRequests: 1, referenceCalls: 1, repairs: 0, elapsedMs: 10,
      usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0, reasoningTokens: 0 }, references: [],
    }
    let state = workshopDraftReducer(createWorkshopDraftState(workspace()), { type: 'candidateCompleted', candidate: original })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'manually edited source' })
    const edited = state.session.abilityCandidates.find(item => item.id === state.session.selectedAbilityCandidateId)!
    expect(edited.provenance).toBeUndefined()
    expect(edited.provider).toBeUndefined()
    expect(edited.model).toBeUndefined()
    expect(edited.inputFingerprint).toBeUndefined()
    expect(state.session.latestAbilityResult?.provenance).toBeUndefined()
    expect(state.session.abilityCandidates.find(item => item.id === 'A')?.provenance).toEqual(original.provenance)
    state = workshopDraftReducer(state, { type: 'abilityValidationStarted', validationId: 'manual-validation' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateValidated', validationId: 'manual-validation', candidateId: edited.id,
      sourceFingerprint: sourceFingerprint(edited.sourceCode), validation: { valid: true, errors: [] } })
    const recovered = createWorkshopDraftState({ ...workspace(2), draft: state.draft })
    expect(recovered.session.abilityCandidates[0].sourceCode).toBe('manually edited source')
    expect(recovered.session.abilityCandidates[0].provenance).toBeUndefined()
    expect(recovered.session.latestAbilityResult?.provenance).toBeUndefined()
  })
  it('preserves an edited source in cross-device recovery when validation of its retained valid original arrives late', () => {
    let state = createWorkshopDraftState(workspace())
    const original = candidate('A', true)
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: original })
    state = workshopDraftReducer(state, { type: 'abilityValidationStarted', validationId: 'validate' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'edited source' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateValidated', validationId: 'validate', candidateId: 'A',
      sourceFingerprint: sourceFingerprint(original.sourceCode), validation: { valid: true, errors: [] } })
    const recovered = createWorkshopDraftState({ ...workspace(2), draft: state.draft })
    expect(recovered.session.abilityCandidates.map(item => item.sourceCode)).toEqual([original.sourceCode, 'edited source'])
    expect(recovered.session.abilityCandidates.find(item => item.id === recovered.session.selectedAbilityCandidateId)?.sourceCode).toBe('edited source')
    expect(recovered.session.latestAbilityResult?.kind).toBe('failed-source')
  })
  it('retains the selected edit of an older valid candidate when the candidate list is full', () => {
    let state = createWorkshopDraftState(workspace())
    for (const item of [candidate('A', true), candidate('B', false), candidate('C', false)]) {
      state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: item })
    }
    state = workshopDraftReducer(state, { type: 'sessionChanged', session: { selectedAbilityCandidateId: 'A' } })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'edited A' })
    expect(state.session.abilityCandidates).toHaveLength(3)
    expect(state.session.abilityCandidates[0]).toMatchObject({ id: 'A', validation: { valid: true } })
    expect(state.session.abilityCandidates[1].id).toBe('C')
    expect(state.session.abilityCandidates.find(item => item.id === state.session.selectedAbilityCandidateId)).toMatchObject({
      sourceCode: 'edited A', validation: { valid: false },
    })
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
    const completed = workshopDraftReducer(state, { ...action, attemptId: 'new' })
    expect(completed.draft).toBe(state.draft)
    expect(completed.session.latestAbilityResult).toBe(state.session.latestAbilityResult)
    expect(completed.session.activeAbilityAttemptId).toBeUndefined()
  })
  it('rejects a late generation result after editing its valid source candidate', () => {
    let state = createWorkshopDraftState(workspace())
    const original = candidate('A', true)
    state = workshopDraftReducer(state, { type: 'candidateCompleted', candidate: original })
    const fingerprint = abilityDraftFingerprint(state.draft)
    state = workshopDraftReducer(state, { type: 'generationStarted', attemptId: 'run' })
    state = workshopDraftReducer(state, { type: 'abilityCandidateEdited', candidateId: 'A', sourceCode: 'manual edit' })
    const completed = workshopDraftReducer(state, {
      type: 'generationFinished', attemptId: 'run', draftFingerprint: fingerprint,
      sourceCandidate: { id: 'A', fingerprint: sourceFingerprint(original.sourceCode) },
      result: { kind: 'candidate', attemptId: 'run', createdAt: 2, message: '' }, candidate: candidate('late', true),
    })
    expect(completed).toBe(state)
    expect(completed.session.activeAbilityAttemptId).toBeUndefined()
    expect(completed.session.abilityCandidates.find(item => item.id === completed.session.selectedAbilityCandidateId)?.sourceCode).toBe('manual edit')
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
  it('keeps an attempt invalid after ability metadata is changed and then reverted', () => {
    let state = createWorkshopDraftState(workspace())
    const original = state.draft
    const fingerprint = abilityDraftFingerprint(original)
    state = workshopDraftReducer(state, { type: 'generationStarted', attemptId: 'run' })
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: { ...original, description: 'different rule' } })
    state = workshopDraftReducer(state, { type: 'draftChanged', draft: original })
    expect(workshopDraftReducer(state, {
      type: 'generationFinished', attemptId: 'run', draftFingerprint: fingerprint,
      result: { kind: 'candidate', attemptId: 'run', createdAt: 2, message: '' }, candidate: candidate('late', true),
    })).toBe(state)
    expect(state.session.activeAbilityAttemptId).toBeUndefined()
  })
})
