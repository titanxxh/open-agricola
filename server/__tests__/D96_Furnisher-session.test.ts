import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D096_Furnisher'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D096_Furnisher'

const advancePlayerSwitches = (session: GameSession, response: SessionResponse) => {
  let current = response
  while (
    current.interaction.stateId === 'wait' &&
    current.interaction.request.kind === 'confirm-player-switch'
  ) {
    current = confirmPlayerSwitch(session)
  }
  return current
}

const setupTwoRoomBuild = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorHand = ['A037_Bucksaw', 'D014_HammerCrusher']
  player.resources = {
    ...player.resources,
    wood: 10,
    reed: 4,
  }
  session.loadState(state)
  return session
}

const setup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationHand.push(CARD_ID)
  player.resources.food = 10
  player.resources.wood = 20
  player.resources.clay = 20
  player.resources.reed = 20
  player.resources.stone = 20
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D096_Furnisher session', () => {
  it('offers one optional improvement for each of two rooms built at once', () => {
    const session = setupTwoRoomBuild()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const construct = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()

    resp = session.resolveChoice(0, construct!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return
    const [roomA, roomB] = resp.interaction.request.farm.selectableTiles
    expect(roomA).toBeDefined()
    expect(roomB).toBeDefined()

    resp = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(4)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    const useFurnisher = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(useFurnisher).toBeDefined()

    resp = session.resolveChoice(0, useFurnisher!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const firstImprovement = resp.interaction.request.options?.find(
      (option) => option.value !== '__skip__',
    )
    expect(firstImprovement).toBeDefined()

    resp = session.resolveChoice(0, firstImprovement!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'A037_Bucksaw',
      'D014_HammerCrusher',
    ])

    resp = session.resolveChoice(0, 'A037_Bucksaw')
    expect(resp.state.players[0]!.minorPlayed).toContain('A037_Bucksaw')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).not.toContain('D014_HammerCrusher')
    expect(resp.state.players[0]!.minorHand).toContain('D014_HammerCrusher')
  })

  it('offers an improvement after the owner builds a room through Building Tycoon', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6

    const actor = state.players[0]!
    actor.houseType = 'clay'
    actor.rooms = 2
    actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    actor.resources = { ...actor.resources, clay: 3, reed: 1, stone: 2 }
    actor.minorPlayed.push('D014_HammerCrusher')

    const furnisher = state.players[1]!
    furnisher.occupationPlayed.push('D128_BuildingTycoon', CARD_ID)
    furnisher.minorHand = ['D014_HammerCrusher']
    furnisher.resources = { ...furnisher.resources, wood: 5, reed: 2, food: 1 }
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const hammerConstruct = resp.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    expect(hammerConstruct).toBeDefined()

    resp = session.resolveChoice(0, hammerConstruct!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return
    const actorRoom = resp.interaction.request.farm.selectableTiles[0]!

    resp = advancePlayerSwitches(session, session.commitSelectionChoice(0, { rooms: [actorRoom] }))
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(1)
    expect(resp.interaction.sourceCard).toBe('D128_BuildingTycoon')
    const tycoonConstruct = resp.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    expect(tycoonConstruct).toBeDefined()

    resp = advancePlayerSwitches(session, session.resolveChoice(1, tycoonConstruct!.value))
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return
    const furnisherRoom = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(1, { rooms: [furnisherRoom] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.rooms).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.playerIndex).toBe(1)
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)

    resp = advancePlayerSwitches(session, session.resolveChoice(1, '__skip__'))
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.rooms).toBe(2)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
  })

  it('card is registered after devPlayCard', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.occupationPlayed).toContain(CARD_ID)
  })

  it('onBuy gives 2 wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 2 })
  })
})
