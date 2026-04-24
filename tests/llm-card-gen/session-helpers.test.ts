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
  autoAdvanceRoundEnd,
  workersAvailable,
} from './session-helpers'

const KNOWN_GOOD_GAIN_CARD = `
const CARD_ID = 'CUSTOM_HELPER_SMOKE'
const CARD_DEF = {
  type: 'minor',
  id: CARD_ID,
  name: 'Helper Smoke',
  deck: 'CUSTOM',
  number: 0,
  desc: ['+1 wood on buy'],
}
const CARD_IMPL = {
  effectHooks: {
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
      expect(p.minorHand).toEqual([])
      expect(p.occupationHand).toEqual([])
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
    expect(state.players[0]!.occupationHand).toEqual([])
    expect(state.players[1]!.minorHand).toEqual([])
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
    expect(state.players[0]!.minorHand).toEqual([])
    expect(state.players[0]!.occupationHand).toEqual([])
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

  it('autoAdvanceRoundEnd is exported and callable (basic shape check)', () => {
    expect(typeof autoAdvanceRoundEnd).toBe('function')
  })
})
