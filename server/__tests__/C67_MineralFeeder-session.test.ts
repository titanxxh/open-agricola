import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/C/C67_MineralFeeder'

const CARD_ID = 'C67_MineralFeeder'

const setupRoundStartSession = (round = 1) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.currentPlayerIndex = 0
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 10
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  session.loadState(state)
  return { session, player: session.getState().state.players[0]! }
}

const addEmptyPasture = (player: ReturnType<typeof setupRoundStartSession>['player']) => {
  player.pastures = [{
    id: 'pasture-1',
    size: 1,
    tiles: [{ row: 2, col: 0 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
}

describe('C67_MineralFeeder session', () => {
  it('skipping reorganize leaves grain unchanged when sheep is outside pasture', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    session.loadState(session.getState().state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('accepting reorganize and moving sheep into pasture gains grain', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    session.loadState(session.getState().state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      { id: 'house', zoneType: 'house', animalType: null, animalCount: 0 },
    ])
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.pastures[0]!.animalType).toBe('sheep')
  })

  it('sheep already in pasture gains grain without animal-reorg prompt', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.pastures[0]!.animalType = 'sheep'
    player.pastures[0]!.animalCount = 1
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .not.toBe('animal-reorg')
  })

  it('does not trigger when the next round is a harvest round', () => {
    const { session, player } = setupRoundStartSession(3)
    addEmptyPasture(player)
    player.resources.sheep = 1
    player.pastures[0]!.animalType = 'sheep'
    player.pastures[0]!.animalCount = 1
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.round).toBe(4)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('does not trigger when player has no sheep', () => {
    const { session, player } = setupRoundStartSession()
    addEmptyPasture(player)
    session.loadState(session.getState().state)

    const resp = session.performRoundEnd()
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })
})
