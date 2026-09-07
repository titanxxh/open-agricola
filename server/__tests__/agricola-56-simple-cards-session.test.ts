import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'
import { D172_PutcherMaker } from '../../shared/cards/D/D172_PutcherMaker'
import { computeAnimalZones, getTotalAnimalCapacity } from '../../shared/domain/animal-zones'
import { getAssignedAnimalsByType } from '../../shared/domain/animals'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const setupLessonsSession = (cardId: string, food = 10) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [cardId]
  player.resources.food = food
  state.players[1]!.workersAvailable = 2
  session.loadState(state)
  return session
}

const chooseFirstNonSkipOption = (session: GameSession, playerIndex: number) => {
  const resp = session.getState()
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.options).toBeDefined()
  const option = resp.interaction.request.options.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(playerIndex, option!.value)
}

const setupHarvestStartSession = (cardId: string) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  }
  state.players[0]!.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

const setupWorkPhaseHookSession = (cardId: string, playerCount = 5) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

const setupRoundStartHookSession = (cardId: string, playerCount = 5) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 2
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  player.resources.food = 0
  session.loadState(state)
  return session
}

const setupActionRewardSession = (cardId: string, playerCount = 6, food = 0) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  player.resources.food = food
  session.loadState(state)
  return session
}

const setupFarmEventSession = (cardId: string, currentPlayerIndex = 0, ownerFood = 0) => {
  const session = new GameSession(undefined, undefined, { playerCount: 6 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = currentPlayerIndex
  state.round = 14
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, player, 2)
  }
  const owner = state.players[0]!
  owner.occupationPlayed.push(cardId)
  owner.resources.food = ownerFood
  session.loadState(state)
  return session
}

const setupLivestockSustainerSession = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 6 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0]!.occupationPlayed.push('B169_LivestockSustainer')
  session.loadState(state)
  return session
}

const getLivestockSustainerZone = (session: GameSession) => {
  const state = session.getState().state
  const owner = state.players[0]!
  return computeAnimalZones(owner, state).find((zone) => zone.id === 'card:B169_LivestockSustainer')
}

const confirmPlayerSwitches = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  let resp = response
  while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
    resp = confirmPlayerSwitch(session)
  }
  return resp
}

const fenceEdgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const givePastureCattle = (session: GameSession, playerIndex: number) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  player.pastures = [{
    id: `cattle-${playerIndex}`,
    size: 1,
    tiles: [{ row: 2, col: playerIndex }],
    stables: 0,
    animalType: 'cattle',
    animalCount: 1,
  }]
  player.resources.cattle = 1
  session.loadState(state)
}

const occupySpace = (session: GameSession, spaceId: string, playerId = 'p2') => {
  const state = session.getState().state
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.takenBy = [{ playerId, workerId: `${playerId}-worker` }]
  session.loadState(state)
}

const setActionSpaceResources = (
  session: GameSession,
  spaceId: string,
  resources: Record<string, number>,
) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  Object.assign(space.resources, resources)
  session.loadState(state)
}

const setStoneAccumulationSpaces = (session: GameSession, stones: Record<string, number>) => {
  const state = session.getState().state
  for (const space of state.actionSpaces) {
    if ((space.gainPerRound.stone ?? 0) > 0) {
      space.resources.stone = stones[space.id] ?? 0
    }
  }
  session.loadState(state)
}

const completeFirstPlowSelection = (session: GameSession, playerIndex = 0) => {
  const resp = session.getState()
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.kind).toBe('farm-select')
  expect(resp.interaction.request.farm?.farmType).toBe('plow')
  const tile = resp.interaction.request.farm?.selectableTiles[0]
  expect(tile).toBeTruthy()
  return session.commitSelectionChoice(playerIndex, { tile })
}

describe('Agricola 5-6 simple occupation cards', () => {
  it('B169 Livestock Sustainer counts other-player major improvements including alsoCountsAs major minors', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[0]!.improvements = ['Major_Well']
    state.players[1]!.improvements = ['Major_Fireplace1', 'Major_Joinery']
    state.players[2]!.minorPlayed = ['D060_LargePottery']
    session.loadState(state)

    const updatedState = session.getState().state
    const owner = updatedState.players[0]!
    const zone = getLivestockSustainerZone(session)

    expect(zone).toMatchObject({
      zoneType: 'card',
      cardId: 'B169_LivestockSustainer',
      capacity: 3,
      animalType: null,
      animalCount: 0,
    })
    expect(getTotalAnimalCapacity(owner, updatedState)).toBe(4)
  })

  it('B169 Livestock Sustainer recomputes capacity when opposing majors leave play', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1', 'Major_Joinery']
    session.loadState(state)

    expect(getLivestockSustainerZone(session)?.capacity).toBe(2)

    const updatedState = session.getState().state
    updatedState.players[1]!.improvements = ['Major_Fireplace1']
    session.loadState(updatedState)

    expect(getLivestockSustainerZone(session)?.capacity).toBe(1)

    const finalState = session.getState().state
    finalState.players[1]!.improvements = []
    session.loadState(finalState)

    expect(getLivestockSustainerZone(session)).toBeUndefined()
  })

  it('B169 Livestock Sustainer caps card capacity at 8', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = [
      'Major_Fireplace1',
      'Major_Fireplace2',
      'Major_CookingHearth1',
      'Major_CookingHearth2',
      'Major_ClayOven',
      'Major_StoneOven',
      'Major_Well',
      'Major_Joinery',
      'Major_Pottery',
      'Major_Basket',
    ]
    session.loadState(state)

    expect(getLivestockSustainerZone(session)?.capacity).toBe(8)
  })

  it('B169 Livestock Sustainer allows mixed animal types on its card zone', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1', 'Major_Joinery', 'Major_Pottery']
    session.loadState(state)

    const updatedState = session.getState().state
    const owner = updatedState.players[0]!
    const zone = getLivestockSustainerZone(session)
    expect(zone?.animalType).toBeNull()

    const effect = getCardEffect('B169_LivestockSustainer')
    const invalid = effect?.getInvalidAnimals?.(
      owner,
      zone!,
      [{ type: 'sheep' }, { type: 'boar' }, { type: 'cattle' }],
      updatedState,
    )
    expect(invalid).toEqual([])
  })

  it('B169 Livestock Sustainer persists animals assigned to its card zone during reorganization', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1']
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('missing sheep market')
    sheepMarket.resources.sheep = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'card:B169_LivestockSustainer', zoneType: 'card', cardId: 'B169_LivestockSustainer', animalType: 'sheep', animalCount: 1 },
      ],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.B169_LivestockSustainer?.extraData).toMatchObject({
      held: 1,
      animalType: 'sheep',
    })
    expect(getLivestockSustainerZone(session)).toMatchObject({
      animalType: 'sheep',
      animalCount: 1,
      capacity: 1,
    })
  })

  it('B169 Livestock Sustainer preserves mixed animal types on its card zone', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1', 'Major_Joinery']
    session.loadState(state)

    let resp = session.devSetResources(0, { sheep: 1, boar: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'card:B169_LivestockSustainer', zoneType: 'card', cardId: 'B169_LivestockSustainer', animalType: null, animalCount: 2, animalCounts: { sheep: 1, boar: 1 } },
      ],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.B169_LivestockSustainer?.extraData).toMatchObject({
      animalCounts: { sheep: 1, boar: 1 },
    })
    expect(getLivestockSustainerZone(session)).toMatchObject({
      animalType: null,
      animalCount: 2,
      capacity: 2,
    })
    expect(getAssignedAnimalsByType(resp.state.players[0]!)).toMatchObject({
      sheep: 1,
      boar: 1,
    })

    resp = session.devSetResources(0, { sheep: 1, boar: 1, cattle: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    const cardZone = resp.interaction.request.zones.find((zone) => zone.id === 'card:B169_LivestockSustainer')
    expect(cardZone).toMatchObject({
      animalType: null,
      animalCount: 2,
      animalCounts: { sheep: 1, boar: 1 },
      allowedAnimalType: null,
    })

    resp = session.resolveChoice(0, 'confirm', {
      zones: resp.interaction.request.zones,
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.B169_LivestockSustainer?.extraData).toMatchObject({
      animalCounts: { sheep: 1, boar: 1 },
    })
  })

  it('B169 Livestock Sustainer leaves capacity changes side-effect free until reorganization clears unavailable storage', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1']
    session.loadState(state)

    let resp = session.devSetResources(0, { sheep: 1 })
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'card:B169_LivestockSustainer', zoneType: 'card', cardId: 'B169_LivestockSustainer', animalType: 'sheep', animalCount: 1 },
      ],
    })
    expect(resp.state.players[0]!.resources.sheep).toBe(1)

    const updatedState = session.getState().state
    updatedState.players[1]!.improvements = []
    session.loadState(updatedState)

    expect(getLivestockSustainerZone(session)).toBeUndefined()
    let owner = session.getState().state.players[0]!
    expect(owner.resources.sheep).toBe(1)
    expect(owner.cardStates?.B169_LivestockSustainer?.extraData).toMatchObject({
      held: 1,
      animalType: 'sheep',
    })

    resp = session.devSetResources(0, { sheep: 1, boar: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    expect(resp.interaction.request.zones.find((zone) => zone.id === 'card:B169_LivestockSustainer')).toBeUndefined()

    resp = session.resolveChoice(0, 'confirm', { zones: [] })
    owner = resp.state.players[0]!
    expect(owner.resources.sheep).toBe(0)
    expect(owner.resources.boar).toBe(0)
    expect(owner.cardStates?.B169_LivestockSustainer?.extraData).toEqual({})
  })

  it('B169 Livestock Sustainer reports pending animals when capacity shrinks below stored animals', () => {
    const session = setupLivestockSustainerSession()
    const state = session.getState().state
    state.players[1]!.improvements = ['Major_Fireplace1', 'Major_Joinery']
    session.loadState(state)

    let resp = session.devSetResources(0, { sheep: 1, boar: 1 })
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'card:B169_LivestockSustainer', zoneType: 'card', cardId: 'B169_LivestockSustainer', animalType: null, animalCount: 2, animalCounts: { sheep: 1, boar: 1 } },
      ],
    })
    expect(resp.ok).toBe(true)

    const updatedState = session.getState().state
    updatedState.players[1]!.improvements = ['Major_Fireplace1']
    session.loadState(updatedState)

    const owner = session.getState().state.players[0]!
    expect(getLivestockSustainerZone(session)).toMatchObject({
      animalCount: 1,
      capacity: 1,
    })
    expect(owner.cardStates?.B169_LivestockSustainer?.extraData).toMatchObject({
      animalCounts: { sheep: 1, boar: 1 },
    })
    expect(session.hasPendingAnimalsCheck(owner)).toBe(true)
  })

  it("A178 Carpenter's Boy gives wood for each room another player builds", () => {
    const session = setupFarmEventSession('A178_CarpentersBoy', 1)
    const state = session.getState().state
    const opponent = state.players[1]!
    opponent.resources.wood = 10
    opponent.resources.reed = 4
    session.loadState(state)

    let resp = session.takeAction(1, 'house-building-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    const rooms = resp.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(rooms).toHaveLength(2)

    resp = session.commitSelectionChoice(1, { rooms })
    expect(resp.ok).toBe(true)
    resp = confirmPlayerSwitches(session, resp)

    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[1]!.rooms).toBe(4)
  })

  it("A178 Carpenter's Boy ignores the owner's own room builds", () => {
    const session = setupFarmEventSession('A178_CarpentersBoy', 0)
    const state = session.getState().state
    const owner = state.players[0]!
    owner.resources.wood = 5
    owner.resources.reed = 2
    session.loadState(state)

    let resp = session.takeAction(0, 'house-building-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const room = resp.interaction.request.farm.selectableTiles[0]
    expect(room).toBeDefined()

    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('B177 Stone Clawer gives one stone after each successful plow leaf', () => {
    const session = setupFarmEventSession('B177_StoneClawer')

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    resp = completeFirstPlowSelection(session)

    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('C179 Bovine Pioneer gives at most one cattle when fencing creates new pastures', () => {
    const session = setupFarmEventSession('C179_BovinePioneer')
    const state = session.getState().state
    state.players[0]!.resources.wood = 8
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('fence')

    resp = session.commitSelectionChoice(0, {
      edges: [
        ...fenceEdgesForTile(1, 1),
        ...fenceEdgesForTile(1, 3),
      ],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.pastures).toHaveLength(2)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
  })

  it('D169 Plowsmith can pay food to plow after an opponent takes 4 wood from accumulation', () => {
    const session = setupFarmEventSession('D169_Plowsmith', 1, 1)
    setActionSpaceResources(session, 'forest', { wood: 4 })

    let resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    }

    resp = confirmPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const acceptOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)
    resp = completeFirstPlowSelection(session)

    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[1]!.resources.wood).toBe(4)
  })

  it('D169 Plowsmith triggers after an opponent takes 4 wood from Riverbank Forest', () => {
    const session = setupFarmEventSession('D169_Plowsmith', 1, 1)
    setActionSpaceResources(session, 'riverbank-forest-56', { wood: 4 })

    let resp = session.takeAction(1, 'riverbank-forest-56')
    expect(resp.ok).toBe(true)
    resp = confirmPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const acceptOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)
    resp = completeFirstPlowSelection(session)

    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[1]!.resources.wood).toBe(4)
    expect(resp.state.players[1]!.resources.reed).toBe(1)
  })

  it('D169 Plowsmith does not offer payment when the owner has no legal plow tile', () => {
    const session = setupFarmEventSession('D169_Plowsmith', 1, 1)
    const state = session.getState().state
    const owner = state.players[0]!
    const roomKeys = new Set(owner.roomTiles.map(positionKey))
    owner.fields = getAllTilePositions()
      .filter((tile) => !roomKeys.has(positionKey(tile)))
      .map((tile) => ({ ...tile, stacks: [] }))
    session.loadState(state)
    setActionSpaceResources(session, 'forest', { wood: 4 })

    let resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    resp = confirmPlayerSwitches(session, resp)

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it('D169 Plowsmith ignores owner, sub-threshold, and non-accumulation wood takes', () => {
    const ownerUse = setupFarmEventSession('D169_Plowsmith', 0, 1)
    setActionSpaceResources(ownerUse, 'forest', { wood: 4 })
    let resp = ownerUse.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.resources.food).toBe(1)

    const smallTake = setupFarmEventSession('D169_Plowsmith', 1, 1)
    setActionSpaceResources(smallTake, 'forest', { wood: 3 })
    resp = smallTake.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.resources.food).toBe(1)

    const instantGain = setupFarmEventSession('D169_Plowsmith', 1, 1)
    resp = instantGain.takeAction(1, 'resource-market-56')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it.each([
    ['hollow-56', 6, { vegetable: 1, grain: 0 }],
    ['hollow-56', 3, { grain: 1, vegetable: 0 }],
  ])('A175 Hollow Gardener rewards %s based on actual clay taken', (spaceId, clay, expected) => {
    const session = setupActionRewardSession('A175_HollowGardener', 6)
    setActionSpaceResources(session, spaceId, { clay })

    const resp = session.takeAction(0, spaceId)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.clay).toBe(clay)
    expect(player.resources.grain).toBe(expected.grain)
    expect(player.resources.vegetable).toBe(expected.vegetable)
  })

  it('A175 Hollow Gardener does not reward less than 3 clay actually taken', () => {
    const session = setupActionRewardSession('A175_HollowGardener', 6)
    setActionSpaceResources(session, 'hollow-56', { clay: 2 })

    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it.each(['western-quarry', 'eastern-quarry'])(
    'A179 Mountain Shepherd gives sheep after using %s',
    (spaceId) => {
      const session = setupActionRewardSession('A179_MountainShepherd', 6)
      setActionSpaceResources(session, spaceId, { stone: 1 })

      const resp = session.takeAction(0, spaceId)
      expect(resp.ok).toBe(true)

      expect(resp.state.players[0]!.resources.stone).toBe(1)
      expect(resp.state.players[0]!.resources.sheep).toBe(1)
    },
  )

  it('B174 Riverbank Gardener gives vegetable after using Riverbank Forest', () => {
    const session = setupActionRewardSession('B174_RiverbankGardener', 6)
    setActionSpaceResources(session, 'riverbank-forest-56', { wood: 1 })

    const resp = session.takeAction(0, 'riverbank-forest-56')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(1)
    expect(player.resources.reed).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })

  it.each([
    [1, { cattle: 1, boar: 0, sheep: 0 }],
    [2, { cattle: 0, boar: 1, sheep: 0 }],
    [3, { cattle: 0, boar: 0, sheep: 1 }],
  ])('B180 Game Teaser rewards exactly %i food from a food accumulation space', (food, expected) => {
    const session = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(session, 'fishing', { food })

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(food)
    expect(player.resources.cattle).toBe(expected.cattle)
    expect(player.resources.boar).toBe(expected.boar)
    expect(player.resources.sheep).toBe(expected.sheep)
  })

  it('B180 Game Teaser gives no reward for 4+ food or non-food accumulation food', () => {
    const fourFood = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(fourFood, 'fishing', { food: 4 })
    let resp = fourFood.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.cattle).toBe(0)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(0)

    const nonFoodAccumulation = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(nonFoodAccumulation, 'forest', { food: 2 })
    resp = nonFoodAccumulation.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
  })

  it('C177 Mountain Hiker can buy stone after using a 5-6 extension accumulation space', () => {
    const session = setupActionRewardSession('C177_MountainHiker', 6, 2)
    setActionSpaceResources(session, 'hollow-56', { clay: 1 })

    let resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseFirstNonSkipOption(session, 0)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(1)
    expect(player.resources.stone).toBe(1)
  })

  it('C177 Mountain Hiker ignores instant-gain 5-6 extension spaces', () => {
    const session = setupActionRewardSession('C177_MountainHiker', 6, 2)

    const resp = session.takeAction(0, 'resource-market-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it.each(['farmland', 'cultivation'])(
    'C176 Cleanacre gives 2 clay after using %s',
    (spaceId) => {
      const session = setupActionRewardSession('C176_Cleanacre', 6)

      let resp = session.takeAction(0, spaceId)
      expect(resp.ok).toBe(true)
      if (spaceId === 'cultivation') {
        resp = chooseFirstNonSkipOption(session, 0)
      }
      resp = completeFirstPlowSelection(session)

      expect(resp.state.players[0]!.resources.clay).toBe(2)
    },
  )

  it('C176 Cleanacre triggers only once when Farming Supplies resolves both branches', () => {
    const session = setupActionRewardSession('C176_Cleanacre', 6, 3)

    let resp = session.takeAction(0, 'farm-supplies-6')
    expect(resp.ok).toBe(true)
    const plowOption = resp.interaction.request.options?.find((option) =>
      JSON.stringify(option.descriptionPreview).includes('actions.plow.name'),
    )
    expect(plowOption).toBeTruthy()
    resp = session.resolveChoice(0, plowOption!.value)
    resp = completeFirstPlowSelection(session)
    const grainOption = resp.interaction.request.options?.find((option) =>
      JSON.stringify(option.effectPreview).includes('"grain":1'),
    )
    expect(grainOption).toBeTruthy()
    resp = session.resolveChoice(0, grainOption!.value)

    const player = resp.state.players[0]!
    expect(player.resources.clay).toBe(2)
    expect(player.resources.grain).toBe(1)
    expect(player.resources.food).toBe(1)
  })

  it('D174 Loess Gardener can buy vegetable after using Clay Pit only', () => {
    const session = setupActionRewardSession('D174_LoessGardener', 6, 2)
    setActionSpaceResources(session, 'clay-pit', { clay: 1 })

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseFirstNonSkipOption(session, 0)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(1)
    expect(player.resources.clay).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })

  it('D174 Loess Gardener does not trigger after using Hollow', () => {
    const session = setupActionRewardSession('D174_LoessGardener', 6, 2)
    setActionSpaceResources(session, 'hollow-56', { clay: 1 })

    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('C174 Stone Custodian gives grain when exactly one stone accumulation space has stone left', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, { 'western-quarry': 1 })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { grain: 1 },
      sourceCard: 'C174_StoneCustodian',
    })
  })

  it('C174 Stone Custodian gives vegetable when at least two stone accumulation spaces have stone left', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, { 'western-quarry': 1, 'eastern-quarry': 1 })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { vegetable: 1 },
      sourceCard: 'C174_StoneCustodian',
    })
  })

  it('C174 Stone Custodian ignores stone on non-stone accumulation spaces', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, {})
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'resource-market-56')!.resources.stone = 1
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toBeNull()
  })

  it.each([
    [3, 1],
    [4, 2],
    [5, 3],
  ])('B172 Cattle Caregiver gives %i cattle owners %i food at round start', (cattleOwners, food) => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    for (let index = 0; index < cattleOwners; index += 1) {
      givePastureCattle(session, index)
    }
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food },
      sourceCard: 'B172_CattleCaregiver',
    })
  })

  it('B172 Cattle Caregiver ignores cattle counters that are not in a valid holding zone', () => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    givePastureCattle(session, 0)
    givePastureCattle(session, 1)
    givePastureCattle(session, 2)
    const state = session.getState().state
    state.players[3]!.resources.cattle = 1
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toMatchObject({ type: 'leaf', params: { food: 1 } })
  })

  it('B172 Cattle Caregiver counts cattle stored on animal-holder cards', () => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    givePastureCattle(session, 0)
    givePastureCattle(session, 1)
    const state = session.getState().state
    state.players[2]!.occupationPlayed.push('B169_LivestockSustainer')
    state.players[2]!.resources.cattle = 1
    state.players[2]!.cardStates = {
      B169_LivestockSustainer: { extraData: { animalCounts: { cattle: 1 } } },
    }
    state.players[3]!.improvements = ['Major_Fireplace1']
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toMatchObject({ type: 'leaf', params: { food: 1 } })
  })

  it('B172 Cattle Caregiver ignores stale cattle when only a non-cattle card zone remains visible', () => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    givePastureCattle(session, 0)
    givePastureCattle(session, 1)
    const state = session.getState().state
    state.players[2]!.occupationPlayed.push('B169_LivestockSustainer', 'B148_PetBroker')
    state.players[2]!.resources.cattle = 1
    state.players[2]!.cardStates = {
      B169_LivestockSustainer: { extraData: { animalCounts: { cattle: 1 } } },
    }
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toBeNull()
  })

  it('A172 Boat Painter offers grain or food when Fishing and 5-6 Traveling Players are occupied', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 5)
    occupySpace(session, 'fishing')
    occupySpace(session, 'traveling-players-56')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'xor',
      children: [
        { type: 'leaf', actionId: 'gain', params: { grain: 1 }, sourceCard: 'A172_BoatPainter' },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'A172_BoatPainter' },
      ],
    })
  })

  it('A172 Boat Painter does not trigger when only Fishing is occupied', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 5)
    occupySpace(session, 'fishing')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toBeNull()
  })

  it('A172 Boat Painter also counts the base Traveling Players space', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 4)
    occupySpace(session, 'fishing')
    occupySpace(session, 'traveling-players')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toMatchObject({ type: 'xor' })
  })

  it('D172 Putcher Maker can exchange multiple reed for food through the anytime exchange action', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['D172_PutcherMaker']
    player.resources.reed = 3
    player.resources.food = 0
    session.loadState(state)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('choice')

    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('C178 On-Site Reverend lets the player choose one building resource at harvest start', () => {
    const session = setupHarvestStartSession('C178_OnSiteReverend')

    let resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const options = resp.interaction.request.options?.filter((option) => option.sourceCard === 'C178_OnSiteReverend')
    expect(options).toHaveLength(4)

    resp = session.resolveChoice(0, options![3]!.value)
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('A176 Wheelmaker tops up wood to 15 when another occupation is in play and the player has more wood than all others combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 11
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.occupationPlayed).toContain('A176_Wheelmaker')
    expect(updatedPlayer.resources.wood).toBe(15)
  })

  it('A176 Wheelmaker does not trigger without another occupation already in play', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('A176 Wheelmaker does not trigger on a wood tie with all other players combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D177 Graduate lets the player pay 1 food for 2 stone and 2 reed when played', () => {
    const session = setupLessonsSession('D177_Graduate', 3)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(false)
      resp = chooseFirstNonSkipOption(session, 0)
      expect(resp.ok).toBe(true)
    }

    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain('D177_Graduate')
    expect(player.resources.food).toBe(2)
    expect(player.resources.stone).toBe(2)
    expect(player.resources.reed).toBe(2)
  })

  it('D177 Graduate has no on-play reward when the player cannot pay food', () => {
    const session = setupLessonsSession('D177_Graduate', 0)
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'D177_Graduate', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D172 Putcher Maker exposes an unlimited anytime reed to food exchange', () => {
    expect(D172_PutcherMaker.exchanges).toEqual([
      { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    ])
  })
})
