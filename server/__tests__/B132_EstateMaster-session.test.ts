import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types'
import { reap, dispatchReapListener } from '../../shared/actions/effects/reap'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed } from '../../shared/domain/player'

import '../../shared/cards/B/B132_EstateMaster'
import '../../shared/cards/catalog'

const CARD_ID = 'B132_EstateMaster'

/**
 * Fill the player's 3×5 farm completely with rooms, fields, pastures, and stables.
 * Layout:
 *   Row 0: rooms at (0,0) (0,1); fields at (0,2) (0,3) (0,4)
 *   Row 1: rooms at (1,0) (1,1); fields at (1,2) (1,3) (1,4)
 *   Row 2: pasture tiles at (2,0)..(2,4)
 */
const fillFarm = (player: PlayerState): void => {
  player.rooms = 4
  player.roomTiles = [
    { row: 0, col: 0 }, { row: 0, col: 1 },
    { row: 1, col: 0 }, { row: 1, col: 1 },
  ]
  player.fields = [
    { row: 0, col: 2, stacks: [] },
    { row: 0, col: 3, stacks: [] },
    { row: 0, col: 4, stacks: [] },
    { row: 1, col: 2, stacks: [] },
    { row: 1, col: 3, stacks: [] },
    { row: 1, col: 4, stacks: [] },
  ]
  player.pastures = [
    { tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }], capacity: 8 },
  ]
  player.stableTiles = []
}

/**
 * Leave one empty farmyard space (only 14 of 15 used).
 */
const fillFarmMinus1 = (player: PlayerState): void => {
  fillFarm(player)
  player.pastures = [
    { tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }], capacity: 6 },
  ]
}

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  return { session, state }
}

const addCardToPlayer = (player: PlayerState) => {
  player.occupationPlayed.push(CARD_ID)
  player.playedCards = player.playedCards ?? []
  player.playedCards.push(`occupation:${CARD_ID}`)
}

const expectBonusVpReaction = (flow: unknown, amount: number) => {
  expect(flow).toEqual({
    type: 'parallel',
    children: [{
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'increment-counter', key: 'bonusVp', amount },
    }],
  })
}

describe('B132_EstateMaster session', () => {
  it('does not score when farm is not saturated', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarmMinus1(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    reap(state, player)

    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('returns 1 VP reaction flow when farm is saturated and 1 vegetable field is reaped', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const result = reap(state, player)

    expectBonusVpReaction(result.reactionFlow, 1)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('returns 2 VP reaction flow when farm is saturated and 2 vegetable fields are reaped', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    player.fields[1]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    const result = reap(state, player)

    expectBonusVpReaction(result.reactionFlow, 2)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('returns VP reaction flow across multiple harvests', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    let result = reap(state, player)
    expectBonusVpReaction(result.reactionFlow, 1)

    result = reap(state, player)
    expectBonusVpReaction(result.reactionFlow, 1)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not score for grain fields', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]
    session.loadState(state)

    reap(state, player)

    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not score when card is not played', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    reap(state, player)

    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not score when vegetable fields have amount=0', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    session.loadState(state)

    reap(state, player)

    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('returns VP reaction flow for extra reap via dispatchReapListener', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    session.loadState(state)

    const flow = dispatchReapListener(state, player, 'vegetable', 1)

    expectBonusVpReaction(flow, 1)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('runs ordinary Harvest Reap reaction flow before the harvest pipeline completes', () => {
    const { session, state } = setupSession()
    state.round = 4
    state.players.forEach((current) => {
      current.resources.food = 10
      markAllWorkersUsed(state, current)
    })
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('computeBonusScore returns accumulated bonusVp', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    addCardToPlayer(player)
    fillFarm(player)
    player.cardStates[CARD_ID] = { counters: { bonusVp: 3 } }
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeBonusScore!(state, player, { reserved: {} })).toBe(3)
  })

  it('computeBonusScore returns 0 when card is not played', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeBonusScore!(state, player, { reserved: {} })).toBe(0)
  })
})
