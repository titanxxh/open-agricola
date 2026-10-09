import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSessionWithLLMCard,
  resetCards,
  FIXED_ROUND_ACTION_ORDER,
  clearAllHands,
  setHand,
  fixRoundActionOrder,
  freezeOtherPlayers,
  getBonusBreakdown,
  workersAvailable,
  autoAdvanceRoundEnd,
  markAllWorkersUsed,
} from './session-helpers'

const KNOWN_GOOD_GAIN_CARD = `
const CARD_ID = 'CUSTOM_HELPER_SMOKE'
const CARD_DEF = {
  cardType: 'minor',
  meta: {
  id: CARD_ID,
  name: 'Helper Smoke',
  deck: 'CUSTOM',
  number: 0,
  desc: ['+1 wood on buy'],
  cost: { wood: 2 },
  prerequisite: '3 Occupations',
  },
}
const CARD_IMPL = {
  effect: {
    onBuy: function (state, player) {
      return {
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1 },
        sourceCard: CARD_ID,
      }
    },
  },
}
`.trim()

afterEach(() => resetCards())

describe('session-helpers', () => {
  it('adapts only a frozen array prerequisite in explicit historical replay',()=>{
    const source=KNOWN_GOOD_GAIN_CARD.replace("prerequisite: '3 Occupations'", "prerequisite: ['3 Occupations']")
    const options={cardId:'CUSTOM_HELPER_SMOKE',cardType:'minor' as const,cardName:'Helper Smoke',cardPrerequisite:'3 Occupations'}
    expect(()=>buildSessionWithLLMCard(source,options)).toThrow('prerequisite must be a string')
    const {session,cardData}=buildSessionWithLLMCard(source,{...options,historicalRecording:true})
    expect(cardData.cardJson.prerequisite).toBe('3 Occupations');session.dispose()
    expect(()=>buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD.replace("prerequisite: '3 Occupations'",'prerequisite: {}'),{...options,historicalRecording:true})).toThrow('prerequisite must be a string')
  })
  it('finishes an already completed round from its response without issuing another round-end command', () => {
    const { session } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE', cardType: 'minor', cardName: 'Helper Smoke',
    })
    const state = session.getState().state
    expect(state.round).toBe(1)
    state.players.forEach(player => markAllWorkersUsed(state, player))
    const initialResponse = session.performRoundEnd()
    expect(initialResponse.ok).toBe(true)
    expect(initialResponse.state).toMatchObject({ round: 2, roundPhase: 'work' })
    const completed = autoAdvanceRoundEnd(session, { initialResponse })
    expect(completed.ok).toBe(true)
    expect(completed.state).toMatchObject({ round: 2, roundPhase: 'work' })
    expect(() => autoAdvanceRoundEnd(session)).toThrow('Round-end command failed: not all workers used')
  })
  it('buildSessionWithLLMCard fixes round-action order and clears hands', () => {
    const { session, cardData } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE',
      cardType: 'minor',
      cardName: 'Helper Smoke',
    })
    expect(cardData.cardJson.id).toBe('CUSTOM_HELPER_SMOKE')
    const state = session.getState().state
    expect(state.roundActionOrder).toEqual([...FIXED_ROUND_ACTION_ORDER])
    state.players.forEach((p) => {
      expect(p.minorHand).toEqual(['__test_placeholder__'])
      expect(p.occupationHand).toEqual(['__test_placeholder__'])
    })
  })

  it('setHand assigns only the provided cards', () => {
    const { session } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE',
      cardType: 'minor',
      cardName: 'Helper Smoke',
    })
    const state = session.getState().state
    setHand(state, 0, { minor: ['CUSTOM_HELPER_SMOKE'] })
    expect(state.players[0]!.minorHand).toEqual(['CUSTOM_HELPER_SMOKE'])
    expect(state.players[0]!.occupationHand).toEqual(['__test_placeholder__'])
    expect(state.players[1]!.minorHand).toEqual(['__test_placeholder__'])
  })

  it('clearAllHands + fixRoundActionOrder are idempotent', () => {
    const { session } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE',
      cardType: 'minor',
      cardName: 'Helper Smoke',
    })
    const state = session.getState().state
    state.players[0]!.minorHand = ['X', 'Y']
    state.players[0]!.occupationHand = ['Z']
    state.roundActionOrder = ['stale']
    clearAllHands(state)
    fixRoundActionOrder(state)
    expect(state.players[0]!.minorHand).toEqual(['__test_placeholder__'])
    expect(state.players[0]!.occupationHand).toEqual(['__test_placeholder__'])
    expect(state.roundActionOrder).toEqual([...FIXED_ROUND_ACTION_ORDER])
  })

  it('freezeOtherPlayers makes non-test player workers unavailable', () => {
    const { session } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE',
      cardType: 'minor',
      cardName: 'Helper Smoke',
    })
    const state = session.getState().state
    expect(workersAvailable(state, state.players[1]!)).toBeGreaterThan(0)
    freezeOtherPlayers(state, 0)
    expect(workersAvailable(state, state.players[1]!)).toBe(0)
    expect(workersAvailable(state, state.players[0]!)).toBeGreaterThan(0)
  })

  it('getBonusBreakdown returns array (empty for player with no bonus cards)', () => {
    const { session } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE',
      cardType: 'minor',
      cardName: 'Helper Smoke',
    })
    const state = session.getState().state
    const breakdown = getBonusBreakdown(state, state.players[0]!)
    expect(Array.isArray(breakdown)).toBe(true)
    expect(breakdown).toEqual([])
  })

  it('does not replace generated metadata with fixture values', () => {
    const { cardData } = buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_HELPER_SMOKE', cardType: 'minor', cardName: 'Do not substitute',
      cardCost: { wood: 99 }, cardPrerequisite: '7 Occupations',
    })
    expect(cardData.cardJson.name).toBe('Helper Smoke')
    expect(cardData.cardJson.cost).toEqual({ wood: 2 })
    expect(cardData.cardJson.prerequisite).toBe('3 Occupations')
  })

  it('rejects an identity mismatch instead of rewriting the source', () => {
    expect(() => buildSessionWithLLMCard(KNOWN_GOOD_GAIN_CARD, {
      cardId: 'CUSTOM_DIFFERENT', cardType: 'minor', cardName: 'Wrong identity',
    })).toThrow(/CARD_DEF|CUSTOM_DIFFERENT/)
  })
})
