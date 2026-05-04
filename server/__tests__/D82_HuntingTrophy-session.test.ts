import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setCardFlag } from '../../shared/cards/helpers/card-state'
import { resolveCardCostWithModifiers } from '../../shared/actions/payment/internal'
import { isComplexCost } from '../../shared/actions/payment/internal'
import '../../shared/cards/D/D82_HuntingTrophy'
import '../../shared/cards/B/B81_Handcart'

const CARD_ID = 'D82_HuntingTrophy'

describe('D82_HuntingTrophy session — chooseOne improvement discount on house-redevelopment', () => {
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
      wood: 2,
      clay: 2,
      stone: 2,
      reed: 2,
      food: 0,
    }
    session.loadState(state)
    return { session, state, player }
  }

  it('without house-redev flag → improvement cost listener is silent', () => {
    const { state, player } = setup()
    // Buy an improvement OUTSIDE house-redev: D82 listener should NOT inject
    // bonuses. B81_Handcart costs { wood: 1 }.
    const baseCost = { wood: 1 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      'B81_Handcart',
      baseCost,
    )
    // Listener returns nothing → flat cost preserved.
    expect(isComplexCost(resolved)).toBe(false)
    expect(resolved).toEqual(baseCost)
  })

  it('with house-redev flag → listener injects 4-choice BonusModifier', () => {
    const { state, player } = setup()
    setCardFlag(player, CARD_ID, true)
    const baseCost = { wood: 1 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      'B81_Handcart',
      baseCost,
    )
    // Listener returns bonuses → ComplexCost wraps base fee + bonuses.
    expect(isComplexCost(resolved)).toBe(true)
    if (!isComplexCost(resolved)) return
    expect(resolved.bonuses).toBeDefined()
    expect(resolved.bonuses!.length).toBeGreaterThanOrEqual(1)
    const d82Bonus = resolved.bonuses!.find((b) =>
      (b.sources ?? []).includes(CARD_ID),
    )
    expect(d82Bonus).toBeDefined()
    expect(d82Bonus!.choices).toBeDefined()
    expect(d82Bonus!.choices!.length).toBe(4)
    const discountKeys = d82Bonus!.choices!.map(
      (c) => Object.keys(c.discount)[0],
    )
    expect(discountKeys.sort()).toEqual(['clay', 'reed', 'stone', 'wood'])
  })

  it('ownership-required: listener does not fire if player does not own D82', () => {
    const { state } = setup()
    const other = state.players[1]!
    setCardFlag(other, CARD_ID, true)
    const baseCost = { wood: 1 }
    const resolved = resolveCardCostWithModifiers(
      state,
      other, // other doesn't have D82 in minorPlayed
      'improvement-any',
      'B81_Handcart',
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
  })
})
