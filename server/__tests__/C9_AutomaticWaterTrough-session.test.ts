import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
const CARD_ID = 'C009_AutomaticWaterTrough'

describe('C009_AutomaticWaterTrough session', () => {
  it('onBuy returns undefined when player has no zone that can hold any animal', () => {
    // BGA `getValidAnimals()` returns empty list when no zone can accommodate
    // sheep / boar / cattle. In that case `onBuy` returns void, so the player
    // does not enter a degenerate XOR with no real options.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // No pastures, no stables, but the default house zone has capacity 1 and
    // is empty — so it CAN accommodate any 1 animal. To force no valid
    // animals, mark the house zone as already full of grain (impossible per
    // game rules but we use it to simulate a saturated state).
    player.houseAnimalType = 'sheep' as never
    player.houseAnimalCount = 1
    // Also put a sheep already in any default stable / pasture so no zone
    // has spare capacity. Player has no pastures by default so house +
    // stables-only is enough.
    player.stableAnimals = {}
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy XOR includes only animals that can be accommodated', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5
    // House holds an empty zone (capacity 1) — can take any 1 animal
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    // All 3 animal types should be available since house zone is empty
    expect(xor.children.length).toBe(3)
    expect(xor.optional).toBe(true)
  })

  it('onBuy filters out animals when already-occupied house pins type', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5
    // House holds a sheep — this is the only zone, so only sheep is valid
    // (zone occupied by sheep, capacity 1, count 1 → no spare). No other
    // animal can be placed; even sheep can't fit another. So result should
    // be undefined.
    player.houseAnimalType = 'sheep' as never
    player.houseAnimalCount = 1
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })
})
