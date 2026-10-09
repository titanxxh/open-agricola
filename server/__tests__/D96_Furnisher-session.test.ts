import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D056_FatstockStretcher'
import '../../shared/cards/D/D062_BeerTap'

import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D096_Furnisher'
import '../../shared/cards/B/B003_Moonshine'
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
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorHand = ['A037_Bucksaw', 'D014_HammerCrusher', 'B067_HandTruck']
  player.resources = {
    ...player.resources,
    wood: 10,
    reed: 4,
  }
  session.loadState(state)
  return session
}

const setup = () => {
  const session = new GameSession(42)
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
  it('chooses two mandatory improvements after building two rooms at once', () => {
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
    const countOptions = resp.interaction.request.options ?? []
    expect(countOptions.map((option) => option.labelParams?.count)).toEqual([0, 1, 2])
    const useFurnisherTwice = countOptions.find((option) => option.labelParams?.count === 2)
    expect(useFurnisherTwice).toBeDefined()

    resp = session.resolveChoice(0, useFurnisherTwice!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'A037_Bucksaw',
      'D014_HammerCrusher',
      'B067_HandTruck',
    ])
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, 'A037_Bucksaw')
    expect(resp.state.players[0]!.minorPlayed).toContain('A037_Bucksaw')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'D014_HammerCrusher',
      'B067_HandTruck',
    ])
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(0, 'D014_HammerCrusher')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toEqual(
      expect.arrayContaining(['A037_Bucksaw', 'D014_HammerCrusher']),
    )
    expect(resp.state.players[0]!.minorHand).toEqual(['B067_HandTruck'])
  })

  it('chooses zero improvements without undoing the built room', () => {
    const session = setupTwoRoomBuild()

    let resp = session.takeAction(0, 'farm-expansion')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected construct choice')
    const construct = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()

    resp = session.resolveChoice(0, construct!.value)
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected room selection')
    }
    const room = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { rooms: [room] })
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Furnisher count choice')
    expect(resp.state.players[0]!.rooms).toBe(3)
    const skipFurnisher = resp.interaction.request.options?.find(
      (option) => option.labelParams?.count === 0,
    )
    expect(skipFurnisher).toBeDefined()
    const resources = resp.state.players[0]!.resources

    resp = session.resolveChoice(0, skipFurnisher!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.resources).toEqual(resources)
    expect(resp.state.players[0]!.minorPlayed).toEqual([])
    expect(resp.state.players[0]!.minorHand).toEqual([
      'A037_Bucksaw',
      'D014_HammerCrusher',
      'B067_HandTruck',
    ])
  })

  it('offers an improvement after the owner builds a room through Building Tycoon', () => {
    const session = new GameSession(42)
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
    const skipFurnisher = resp.interaction.request.options?.find(
      (option) => option.labelParams?.count === 0,
    )
    expect(skipFurnisher).toBeDefined()
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(0)

    resp = advancePlayerSwitches(session, session.resolveChoice(1, skipFurnisher!.value))
    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.rooms).toBe(2)
    expect(resp.state.log.filter(
      (entry) => entry.key === 'log.provisionalContinuationRollback',
    )).toHaveLength(1)
  })

  it('skips exhausted nested return points after the outer player resumes', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 6
    state.availableMajorImprovements = []

    const actor = state.players[0]!
    actor.houseType = 'clay'
    actor.rooms = 2
    actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    actor.resources = { ...actor.resources, wood: 1, clay: 3, reed: 2, stone: 3 }
    actor.minorPlayed.push('D014_HammerCrusher')
    actor.minorHand = ['A037_Bucksaw']
    actor.occupationHand = ['__test_placeholder__']

    const furnisher = state.players[1]!
    furnisher.occupationPlayed.push('D128_BuildingTycoon', CARD_ID)
    furnisher.minorHand = ['B003_Moonshine', 'B070_NewPurchase']
    furnisher.occupationHand = ['A116_WoodCutter']
    furnisher.resources = { ...furnisher.resources, wood: 5, reed: 2, food: 3 }
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Hammer Crusher choice')
    const hammerConstruct = resp.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    expect(hammerConstruct).toBeDefined()

    resp = session.resolveChoice(0, hammerConstruct!.value)
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected Hammer Crusher room selection')
    }
    const actorRoom = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { rooms: [actorRoom] })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request : undefined).toMatchObject({
      kind: 'confirm-player-switch',
      fromPlayerIndex: 0,
      toPlayerIndex: 1,
    })
    resp = confirmPlayerSwitch(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Building Tycoon choice')
    expect(resp.interaction.sourceCard).toBe('D128_BuildingTycoon')
    const tycoonConstruct = resp.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    expect(tycoonConstruct).toBeDefined()

    resp = session.resolveChoice(1, tycoonConstruct!.value)
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected Building Tycoon room selection')
    }
    const furnisherRoom = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(1, { rooms: [furnisherRoom] })
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Furnisher choice')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    const useFurnisher = resp.interaction.request.options.find(
      (option) => option.labelParams?.count === 1,
    )
    expect(useFurnisher).toBeDefined()

    resp = session.resolveChoice(1, useFurnisher!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Furnisher improvement choice')
    expect(resp.interaction.request.options.map((option) => option.value)).toEqual(
      expect.arrayContaining(['B003_Moonshine', 'B070_NewPurchase']),
    )
    expect(resp.interaction.request.options.some((option) => option.value === '__skip__')).toBe(false)

    resp = session.resolveChoice(1, 'B003_Moonshine')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Moonshine choice')
    expect(resp.interaction.sourceCard).toBe('B003_Moonshine')

    resp = session.resolveChoice(1, 'play')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request : undefined).toMatchObject({
      kind: 'confirm-player-switch',
      fromPlayerIndex: 1,
      toPlayerIndex: 0,
    })
    resp = confirmPlayerSwitch(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected outer improvement choice')
    expect(resp.interaction.playerIndex).toBe(0)
    expect(resp.interaction.request.options.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.houseType).toBe('stone')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : undefined)
      .toBe('confirm-next-player')
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

describe('D096 Furnisher parity', () => {
  const CARD_ID = 'D096_Furnisher'

  const MINOR_A = 'D056_FatstockStretcher'

  const MAJOR = 'Major_Fireplace1'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, resources = {}, minors = [], major = false,
  }: {
    played?: boolean
    resources?: Partial<SessionResponse['state']['players'][number]['resources']>
    minors?: string[]
    major?: boolean
  } = {}) => {
    const session = new GameSession(6096, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources,
        food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    player.minorHand = minors.length > 0 ? [...minors] : [FILLER]
    player.resources = { ...player.resources, ...resources }
    if (major && !state.availableMajorImprovements.includes(MAJOR)) {
      state.availableMajorImprovements.push(MAJOR)
    }
    session.loadState(state)
    return session
  }

  const buildRooms = (session: GameSession, count: number) => {
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'farm-select') {
      const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
      expect(construct, JSON.stringify(response.interaction)).toBeDefined()
      if (!construct) return response
      response = session.resolveChoice(response.interaction.playerIndex, construct.value)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      return response
    }
    const rooms = response.interaction.request.farm.selectableTiles.slice(0, count)
    expect(rooms).toHaveLength(count)
    return session.commitSelectionChoice(0, { rooms })
  }

  const chooseFurnisherCount = (session: GameSession, response: SessionResponse, count: number) => {
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe(CARD_ID)
    const countChoice = options(response).find((option) => option.labelParams?.count === count)
    expect(countChoice, JSON.stringify(response.interaction)).toBeDefined()
    return countChoice
      ? session.resolveChoice(response.interaction.playerIndex, countChoice.value)
      : response
  }

  const chooseImprovement = (session: GameSession, response: SessionResponse, cardId: string) => {
    for (let guard = 0; guard < 6 && response.interaction.stateId === 'wait'; guard += 1) {
      const player = response.state.players[0]!
      if (player.improvements.includes(cardId) || player.minorPlayed.includes(cardId)) break
      const choices = options(response)
      const card = choices.find((option) =>
        option.value === cardId || option.value === `minor:${cardId}`)
      if (card) {
        response = session.resolveChoice(response.interaction.playerIndex, card.value)
        continue
      }
      if (response.interaction.promptKey === 'prompt.selectPayment') {
        const payment = choices.find((option) => option.value.startsWith('pay:')) ?? choices[0]
        expect(payment, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
        continue
      }
      const enter = choices.find((option) => option.value.startsWith('action-improvement-'))
        ?? choices.find((option) => option.labelKey?.includes('improvement'))
      expect(enter, JSON.stringify(response.interaction)).toBeDefined()
      if (!enter) break
      response = session.resolveChoice(response.interaction.playerIndex, enter.value)
    }
    return response
  }

  it('D096 S2: one new room permits one one-wood minor for free', () => {
    const session = setup({ resources: { wood: 5, reed: 2 }, minors: [MINOR_A] })
    let response = chooseFurnisherCount(session, buildRooms(session, 1), 1)
    response = chooseImprovement(session, response, MINOR_A)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_A)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D096 S5: building only a stable grants no Furnisher improvement', () => {
    const session = setup({ resources: { wood: 2 }, minors: [MINOR_A] })
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'farm-select') {
      const stable = options(response).find((option) => [
        'actions.stable.name', 'actions.stables.name', 'actions.buildStables.name',
      ].includes(option.labelKey ?? ''))
      expect(stable, JSON.stringify(response.interaction)).toBeDefined()
      if (!stable) return
      response = session.resolveChoice(response.interaction.playerIndex, stable.value)
    }
    expect(response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'farm-select'
      ? response.interaction.request.farm.farmType
      : undefined).toBe('stable')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return
    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { stables: [tile] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('D096 S6: an improvement without a wood cost is still eligible', () => {
    const session = setup({ resources: { wood: 5, reed: 2, clay: 2 }, major: true })
    let response = chooseFurnisherCount(session, buildRooms(session, 1), 1)
    response = chooseImprovement(session, response, MAJOR)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})
