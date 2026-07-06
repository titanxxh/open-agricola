import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { PlayerState } from '../../shared/contract/types'

import '../../shared/cards/catalog'
import '../../shared/cards/B/B132_EstateMaster'
import '../../shared/cards/C/C072_FestivalPlanning'

const fillSaturatedFarmWithVegetable = (player: PlayerState) => {
  player.rooms = 4
  player.roomTiles = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
  ]
  player.fields = [
    { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    { row: 0, col: 3, stacks: [] },
    { row: 0, col: 4, stacks: [] },
    { row: 1, col: 2, stacks: [] },
    { row: 1, col: 3, stacks: [] },
    { row: 1, col: 4, stacks: [] },
  ]
  player.pastures = [{
    tiles: [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ],
    capacity: 8,
  }]
  player.stableTiles = []
}

const setupFestivalPlanning = () => {
  const session = new GameSession(1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  const opponent = state.players[1]!
  player.resources.food = 3
  player.resources.wood = 1
  player.occupationPlayed = ['B132_EstateMaster', 'TEST_Occupation']
  player.minorHand = ['C072_FestivalPlanning', 'A037_Bucksaw']
  player.occupationHand = ['__test_placeholder__']
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  fillSaturatedFarmWithVegetable(player)
  session.loadState(state)
  return session
}

const buyFestivalPlanning = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  const accept = resp.interaction.stateId === 'wait'
    ? resp.interaction.request.options?.find((option) => option.value !== '__skip__')?.value
    : undefined
  expect(accept).toBeDefined()

  resp = session.resolveChoice(0, accept!)
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  expect(resp.interaction.stateId === 'wait'
    ? resp.interaction.request.options?.some((option) => option.value === 'C072_FestivalPlanning')
    : false).toBe(true)

  return session.resolveChoice(0, 'C072_FestivalPlanning')
}

describe('Private Field Phase session flow', () => {
  it('Festival Planning resolves Reap reactions before offering the optional improvement', () => {
    const session = setupFestivalPlanning()

    const resp = buyFestivalPlanning(session)

    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.minorPlayed).toContain('C072_FestivalPlanning')
    expect(player.resources.vegetable).toBe(1)
    expect(player.cardStates.B132_EstateMaster?.counters?.bonusVp).toBe(1)
    expect(resp.state.round).toBe(1)
    expect(resp.state.roundPhase).toBe('work')
    expect(player.resources.begging).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.some((option) => option.value === '__skip__')
      : false).toBe(true)
  })
})
