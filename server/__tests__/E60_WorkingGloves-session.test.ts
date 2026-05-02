import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAllBuyableCombinations } from '../../shared/actions/helpers/payment'
import '../../shared/cards/E/E60_WorkingGloves'

const CARD_ID = 'E60_WorkingGloves'

describe('E60_WorkingGloves session — trade-style modifier on occupation cost', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 1,
      stone: 1,
      reed: 1,
      food: 4,
    }
    session.loadState(state)
    // After loadState normalizes, fetch the canonical player reference.
    const live = session.getState().state.players[0]!
    return { session, state, player: live }
  }

  it('player.activeModifiers contains 4 trade modifiers for occupation cost', () => {
    const { player } = setup()
    const e60Mods = player.activeModifiers.filter((m) => m.cardId === CARD_ID)
    expect(e60Mods.length).toBe(4)
    expect(e60Mods.every((m) => m.type === 'trade')).toBe(true)
    expect(e60Mods.every((m) => m.appliesTo.includes('occupation'))).toBe(true)
    const fromKeys = e60Mods.map((m) => m.type === 'trade' ? Object.keys(m.from)[0] : '').sort()
    expect(fromKeys).toEqual(['clay', 'reed', 'stone', 'wood'])
  })

  it('cost-pipeline emits ≥5 PaymentSolution paths (base + 4 trade alternatives)', () => {
    const { player } = setup()
    // Simulate playing an occupation with cost { food: 2 }.
    const solutions = computeAllBuyableCombinations(
      player,
      { fee: { food: 2 } },
      undefined,
      'occupation',
    )
    expect(solutions.length).toBeGreaterThanOrEqual(5)
    // Base solution: pay food:2.
    const base = solutions.find(
      (s) =>
        (s.resourcesPaid.food ?? 0) === 2 &&
        (s.resourcesPaid.wood ?? 0) === 0 &&
        (s.resourcesPaid.clay ?? 0) === 0 &&
        (s.resourcesPaid.stone ?? 0) === 0 &&
        (s.resourcesPaid.reed ?? 0) === 0,
    )
    expect(base).toBeDefined()
    // Each building resource trade alternative: pay 1 of that resource, 0 food.
    for (const res of ['wood', 'clay', 'stone', 'reed'] as const) {
      const tradeSol = solutions.find(
        (s) =>
          (s.resourcesPaid.food ?? 0) === 0 &&
          (s.resourcesPaid[res] ?? 0) === 1,
      )
      expect(tradeSol, `trade alt for ${res}`).toBeDefined()
    }
  })

  it('does not affect non-occupation cost types', () => {
    const { player } = setup()
    // Renovation cost: pay 2 clay + 1 reed. The 4 occupation trades must not
    // appear because their appliesTo doesn't include 'renovation'.
    const solutions = computeAllBuyableCombinations(
      player,
      { fee: { clay: 1, reed: 1 } },
      undefined,
      'renovation',
    )
    // All solutions should pay the literal cost (or be limited by what's
    // available). No solution should pay 0 clay + 0 reed via E60 trade.
    const e60TradeUsed = solutions.find((s) =>
      s.tradesUsed.some((t) => t.trade.sourceId === CARD_ID && t.times > 0),
    )
    expect(e60TradeUsed).toBeUndefined()
  })
})
