import { afterEach, describe, expect, it } from 'vitest'
import { acceptanceInputs, assertCapabilityGap, sourceWith } from './inputs'
import { evaluateBehavior } from './behavior'
import { acceptanceSeed as seed } from './seeds'
import { resetCards } from '../session-helpers'
import { getWorkshopSandboxContract } from '../../../server/workshop-sandbox-contract'

afterEach(resetCards)

describe('complete declared acceptance matrix', () => {
  it('declares exactly 16 implementable scenarios plus one capability gap', () => {
    expect(acceptanceInputs).toHaveLength(17)
    expect(new Set(acceptanceInputs.map(input => input.id)).size).toBe(17)
    expect(acceptanceInputs.filter(input => input.expected === 'source')).toHaveLength(16)
  })
  it.each(acceptanceInputs.filter(input => input.expected === 'source'))('$id has a working unmodified-source oracle', input => {
    const result = evaluateBehavior(input, seed(input.id))
    expect(result, result.reason).toMatchObject({ ok: true })
  })
  it('uses the deployed listener identity paths to distinguish the actor from the card owner', () => {
    const input = acceptanceInputs.find(input => input.id === 'M16-forest-english')!
    const { actor, owner } = getWorkshopSandboxContract().listeners.players
    const actorId = `context[${JSON.stringify(actor)}].id`
    const ownerId = `context[${JSON.stringify(owner)}].id`
    const source = sourceWith(input.draft.cardId, input.draft.name, 'occupation', `{
      listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], scope: 'any', handler: context => {
        if (context.space.id !== 'forest' || ${actorId} !== ${ownerId}) return;
        return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID };
      } }]
    }`)
    const result = evaluateBehavior(input, source)
    expect(result, result.reason).toMatchObject({ ok: true })
    resetCards()
    // Regression: a flat, nonexistent actor ID silently suppresses the reward.
    const bad = evaluateBehavior(input, source.replace(actorId, 'context.playerId'))
    expect(bad.ok, bad.reason).toBe(false)
  })
  it.each([
    ['M1-immediate-gain-with-cost-prereq', /"prerequisite":"3 Occupations"/, '"prerequisite":""'],
    ['M2-per-action-bonus', /phases:\s*\['after'\]/, "phases: ['after'], scope: 'any'"],
    ['M5-cost-reduction', /actions:\s*\['renovate-house'\]/, "actions: ['renovate-house', 'construct']"],
    ['M8-cross-player-trigger', /scope:\s*'any'/, "scope: 'player'"],
    ['M11-improvement-cost-reduction', /discount:\s*\{ wood: 2 \}/, 'discount: { wood: 1 }'],
    ['M12-combined-forest-counter', /\(count \+ 1\) % 3/, '(count + 1) % 2'],
    ['M13-selected-candidate-followup', /food: 2/, 'food: 9'],
    ['M14-tested-source-repair', /state.round \+ 1/, 'state.round + 2'],
  ] as const)('rejects a known bad %s result', (id, pattern, replacement) => {
    const source = seed(id)
    const bad = source.replace(pattern, replacement)
    expect(bad).not.toBe(source)
    const result = evaluateBehavior(acceptanceInputs.find(input => input.id === id)!, bad)
    expect(result.ok, result.reason).toBe(false)
  })
  it('requires a precise gap, preserving crops, costs and component supply', () => {
    const explanation = 'The sandbox lacks getSpecialStablePositions and applySpecialStable candidate/settlement hooks. It cannot preserve grain crops on the field while also applying normal payment and component supply.'
    expect(() => assertCapabilityGap('capability-gap', explanation, false)).not.toThrow()
    expect(() => assertCapabilityGap('candidate', explanation, true)).toThrow()
    expect(() => assertCapabilityGap('capability-gap', 'Not supported', false)).toThrow()
    expect(() => assertCapabilityGap('capability-gap', explanation.replace('payment', 'exchange'), false)).toThrow()
  })
})
