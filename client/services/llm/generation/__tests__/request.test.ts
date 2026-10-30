import { describe, expect, it } from 'vitest'
import type { WorkshopAbilityCandidateContract, WorkshopDraftContract } from '../../../../../shared/contract/workshop'
import { abilityArtifactFingerprint, sourceFingerprint } from '../../../../../shared/projections/workshop-generation'
import { buildGenerationRequest, type PlaytestFailure } from '../request'

const draft = {
  cardId: 'CUSTOM_Test', cardType: 'minor', name: 'Test', description: 'Gain food',
  cardJson: { id: 'CUSTOM_Test', card_type: 'minor', name: 'Test', cost: { wood: 2 } },
  effectCode: 'adopted source', artUrl: null,
  generation: { ability: { adopted: { testing: { code: 'adopted tests' } } } },
} satisfies WorkshopDraftContract
const selected = {
  id: 'B', kind: 'ability', sourceCode: 'selected B', cardJson: draft.cardJson,
  validation: { valid: true }, prompt: 'old', createdAt: 1, testing: { code: 'selected tests' },
} satisfies WorkshopAbilityCandidateContract
const options = { workspaceId: 'w', baseRevision: 1, draft, intent: { kind: 'follow-up', message: 'make it 2 wood' } } satisfies Parameters<typeof buildGenerationRequest>[0]

describe('immutable generation request', () => {
  it('freezes selected source and tests together, or uses the adopted pair without a selection', () => {
    const current = structuredClone(selected)
    const snapshot = buildGenerationRequest({ ...options, selectedCandidate: current })
    current.sourceCode = 'edited afterward'
    current.testing.code = 'edited tests'
    expect(snapshot.input.source).toBe('selected B')
    expect(snapshot.input.tests).toBe('selected tests')
    expect(snapshot.sourceCandidate).toEqual({ id: 'B', fingerprint: abilityArtifactFingerprint('selected B', 'selected tests') })
    expect(Object.isFrozen(snapshot.input.card.definition)).toBe(true)
    expect(buildGenerationRequest(options).input).toMatchObject({ source: 'adopted source', tests: 'adopted tests' })
  })

  it('changes request identity when only selected or adopted tests change', () => {
    const before = buildGenerationRequest({ ...options, selectedCandidate: selected })
    const after = buildGenerationRequest({ ...options, selectedCandidate: { ...selected, testing: { code: 'changed tests' } } })
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint)
    expect(after.sourceCandidate?.fingerprint).not.toBe(before.sourceCandidate?.fingerprint)
    const adopted = buildGenerationRequest(options)
    const changed = buildGenerationRequest({ ...options, draft: { ...draft, generation: { ability: { adopted: { testing: { code: 'changed tests' } } } } } })
    expect(changed.inputFingerprint).not.toBe(adopted.inputFingerprint)
    expect(changed.draftFingerprint).not.toBe(adopted.draftFingerprint)
  })

  it('does not borrow adopted tests for a selected candidate without tests', () => {
    expect(buildGenerationRequest({ ...options, selectedCandidate: { ...selected, testing: undefined } }).input.tests).toBeNull()
  })

  it('preserves raw alternatives and excludes private editor metadata', () => {
    const capture = (costInput: string) => buildGenerationRequest({ ...options,
      draft: { ...draft, cardJson: { ...draft.cardJson, cost: { wood: 1, clay: 1 },
        _draft: { costInput, prerequisite: 'At least 2 occupations', unrelated: 'private-internal-field' } } },
    })
    const alternative = capture('1 wood or 1 clay')
    const combined = capture('1 wood and 1 clay')
    expect(alternative.input.card).toMatchObject({ requirements: { cost: '1 wood or 1 clay', prerequisite: 'At least 2 occupations' } })
    expect(combined.input.card).toMatchObject({ requirements: { cost: '1 wood and 1 clay' } })
    expect(alternative.inputFingerprint).not.toBe(combined.inputFingerprint)
    expect(alternative.draftFingerprint).not.toBe(combined.draftFingerprint)
    expect(JSON.stringify(alternative)).not.toContain('private-internal-field')
    expect(alternative.input.card.definition).not.toHaveProperty('_draft')
  })

  it('does not borrow adopted metadata for selected source or a recorded failure', () => {
    const current = { ...draft, description: 'Draft A: gain clay', cardJson: { ...draft.cardJson, cost: { clay: 2 }, _draft: { costInput: '2 clay', prerequisite: '4 occupations' } } }
    const candidate = { ...selected, cardJson: { cost: { wood: 1 }, desc: ['B: gain wood next round'] } }
    const followup = buildGenerationRequest({ ...options, draft: current, selectedCandidate: candidate })
    expect(followup.input.card).toMatchObject({ definition: { cost: { wood: 1 } }, requirements: {}, description: 'B: gain wood next round' })
    const repair = buildGenerationRequest({ ...options, selectedCandidate: candidate, intent: { kind: 'repair', message: 'Fix the tested source', failure: {
      workspaceId: 'w', versionId: 'version-B', source: 'tested B', sourceFingerprint: sourceFingerprint('tested B'),
      identity: { id: draft.cardId, type: draft.cardType, name: draft.name }, errors: ['runtime error'], gameSeed: 7,
    } } })
    expect(repair.input).toMatchObject({ source: 'tested B', tests: null, card: { definition: {}, requirements: {}, description: '' }, intent: { failure: { versionId: 'version-B', gameSeed: 7 } } })
    expect(repair.sourceCandidate).toBeUndefined()
  })

  it.each([
    { sourceFingerprint: 'wrong', workspaceId: 'w', identity: { id: draft.cardId, type: draft.cardType, name: draft.name } },
    { sourceFingerprint: sourceFingerprint('B'), workspaceId: 'other', identity: { id: draft.cardId, type: draft.cardType, name: draft.name } },
    { sourceFingerprint: sourceFingerprint('B'), workspaceId: 'w', identity: { id: 'CUSTOM_Changed', type: draft.cardType, name: draft.name } },
    { sourceFingerprint: sourceFingerprint('B'), workspaceId: 'w', identity: { id: draft.cardId, type: 'occupation', name: draft.name } },
    { sourceFingerprint: sourceFingerprint('B'), workspaceId: 'w', identity: { id: draft.cardId, type: draft.cardType, name: 'Changed' } },
  ] satisfies Array<Pick<PlaytestFailure, 'sourceFingerprint' | 'workspaceId' | 'identity'>>)('rejects repair with stale recorded source, workspace or identity: %j', binding => {
    expect(() => buildGenerationRequest({ ...options, intent: { kind: 'repair', message: 'fix', failure: { ...binding, versionId: 'B', source: 'B', errors: [] } } })).toThrow()
  })
})
