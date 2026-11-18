import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import { scoringOfferChoice, type ScoringOffer } from '../plans/scoring-offer'

const state = createInitialState(5099, { playerCount: 2 })
const player = state.players[0]!
const pay = (value: string, food: number, score: number): ScoringOffer => ({
  value, kind: 'pay', resources: { food }, score,
})

describe('scoring offer choices', () => {
  it('keeps cheaper lower-scoring choices while removing dominated investments', () => {
    const choice = scoringOfferChoice('TEST_Scoring', () => [
      pay('skip', 0, 0), pay('one', 1, 1), pay('two', 2, 2), pay('three', 3, 3),
      pay('four', 4, 2), pay('five', 5, 3), pay('six', 6, 4), pay('seven', 7, 3),
      pay('eight', 8, 4), pay('nine', 9, 5),
    ])
    expect(choice.options(player).map(option => option.value)).toEqual(['skip', 'one', 'two', 'three', 'six', 'nine'])
    expect(choice.promptLeaf(player, 'ui.interactionExchangeChoice')).toMatchObject({
      params: { options: choice.options(player) },
    })
    expect(choice.resolveChoice(state, player, 'four')).toBeUndefined()
    expect(choice.resolveChoice(state, player, 'nine')).toMatchObject({ type: 'seq' })
  })

  it('prefers a higher reward at equal cost and preserves equal outcomes with different identities', () => {
    const choice = scoringOfferChoice('TEST_Scoring', () => [
      pay('low', 2, 1), pay('high', 2, 2), pay('equivalent', 2, 2),
    ])
    expect(choice.options(player).map(option => option.value)).toEqual(['high', 'equivalent'])
  })

  it('keeps the explicit decline choice even when a reward is free', () => {
    const choice = scoringOfferChoice('TEST_Scoring', () => [pay('skip', 0, 0), pay('free', 0, 1)])
    expect(choice.options(player).map(option => option.value)).toEqual(['skip', 'free'])
    expect(choice.resolveChoice(state, player, 'skip')).toBeUndefined()
  })

  it('keeps incomparable resources and distinct payment or reserve semantics', () => {
    const choice = scoringOfferChoice('TEST_Scoring', () => [
      pay('food', 2, 1),
      { value: 'wood', kind: 'pay', resources: { wood: 1 }, score: 2 },
      { value: 'occupation', kind: 'reserve', resources: { food: 1 }, score: 2, cardType: 'occupation' },
      { value: 'minor', kind: 'reserve', resources: { food: 2 }, score: 1, cardType: 'minor' },
      { value: 'worse-reserve', kind: 'reserve', resources: { food: 3 }, score: 1, cardType: 'occupation' },
    ])
    expect(choice.options(player).map(option => option.value)).toEqual(['food', 'wood', 'occupation', 'minor'])
  })
})
