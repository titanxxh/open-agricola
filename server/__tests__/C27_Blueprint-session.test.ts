import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { resolveCardCostWithModifiers } from '../../shared/actions/helpers/pay-helpers'
import { isComplexCost } from '../../shared/actions/helpers/payment'
import '../../shared/cards/C/C27_Blueprint'

const CARD_ID = 'C27_Blueprint'

/**
 * C27 Blueprint — verify-only.
 *
 * BGA `Cards/C/C27_Blueprint.php::onPlayerComputeCardCosts` reduces stone by 1
 * for `Major_Joinery`, `Major_Pottery`, `Major_Basket` only. The listener in
 * `shared/cards/C/C27_Blueprint.ts` allow-lists exactly these three ids and
 * subtracts `stone: -1`. This test confirms the BGA-aligned cost path.
 */
describe('C27_Blueprint session — verify chooseOne aligned to BGA majors', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return { session, state, player: session.getState().state.players[0]! }
  }

  const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

  it.each(ALLOWED_MAJORS)('reduces stone cost by 1 for %s', (majorId) => {
    const { state, player } = setup()
    // Joinery cost: { wood: 2, stone: 2 }. Pottery / Basket also include stone.
    // The listener subtracts stone:-1, mutating cost in place via applyCostOverride.
    const baseCost = { wood: 2, stone: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      majorId,
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.stone).toBe(1)
    expect(resolved.wood).toBe(2)
  })

  it('does NOT reduce cost for non-listed majors (e.g. Major_Fireplace)', () => {
    const { state, player } = setup()
    const baseCost = { clay: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      'Major_Fireplace',
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.clay).toBe(2)
  })

  it('does NOT reduce cost when player does not own C27', () => {
    const { state } = setup()
    const other = state.players[1]!
    const baseCost = { wood: 2, stone: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      other,
      'improvement-any',
      'Major_Joinery',
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.stone).toBe(2)
  })
})
