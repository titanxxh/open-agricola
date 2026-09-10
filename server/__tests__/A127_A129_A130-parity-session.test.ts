import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import {
  familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/A/A127_Lodger'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A130_MummysBoy'

const FILLER = '__test_placeholder__'

const setup = (cardId: string, playerCount: number, round = 5, played = true) => {
  const session = new GameSession(7127 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openWishChildren = (session: GameSession) => {
  const state = session.getState().state
  state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
  state.roundActionOrder[0] = 'wish-children'
  state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = []
  session.loadState(state)
}

describe('A127 Lodger parity', () => {
  it('A127 S1: playing Lodger by round nine enables one room-limited family growth', () => {
    const session = setup('A127_Lodger', 3, 9, false)
    const played = playOccupation(session, 'A127_Lodger')
    expect(played.state.players[0]!.occupationPlayed).toContain('A127_Lodger')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    openWishChildren(session)
    const before = familySize(session.state.players[0]!)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('A127 S2: playing Lodger after round nine grants no extra room', () => {
    const session = setup('A127_Lodger', 3, 10, false)
    const played = playOccupation(session, 'A127_Lodger')
    expect(played.state.players[0]!.occupationPlayed).toContain('A127_Lodger')
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    openWishChildren(session)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it.each([
    ['S3', 2, 2],
    ['S4', 3, 3],
  ] as const)('A127 %s: round nine returning home with %i rooms leaves %i people', (_scenario, rooms, expected) => {
    const session = setup('A127_Lodger', 3, 9)
    const state = session.getState().state
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 3)
    setWorkersAtHome(state, owner, 3)
    owner.rooms = rooms
    owner.roomTiles = Array.from({ length: rooms }, (_, col) => ({ row: 2, col }))
    owner.cardStates.A127_Lodger = { extraData: { hasRoom: true } }
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
    })
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(expected)
    expect(response.state.players[0]!.cardStates.A127_Lodger?.extraData?.hasRoom).toBe(false)
  })
})

const driveSwagman = (session: GameSession, response: SessionResponse, accept: boolean) => {
  for (let guard = 0; guard < 24 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    if (response.interaction.request.kind === 'farm-select') {
      const farm = response.interaction.request.farm
      if (farm.farmType === 'sow') {
        const field = farm.selectableFields[0]!
        response = session.commitSelectionChoice(0, { crops: [{ ...field.tile, crop: 'grain' }] })
      } else if (farm.farmType === 'stable') {
        response = session.commitSelectionChoice(0, { stables: [farm.selectableTiles[0]!] })
      } else break
      continue
    }
    const options = response.interaction.request.options ?? []
    const card = options.find((option) => option.sourceCard === 'A129_Swagman' && option.value !== '__skip__')
    const skip = options.find((option) => option.value === '__skip__')
    const ordinary = options.find((option) => option.value !== '__skip__' && option.value !== '__pass__')
    if (card) response = session.resolveChoice(0, accept ? card.value : skip!.value)
    else if (skip) response = session.resolveChoice(0, skip.value)
    else if (ordinary) response = session.resolveChoice(0, ordinary.value)
    else break
  }
  return response
}

describe('A129 Swagman parity', () => {
  it('A129 S1: Swagman can be played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup('A129_Swagman', 3, 5, false), 'A129_Swagman')
      .state.players[0]!.occupationPlayed).toContain('A129_Swagman')
  })

  it('A129 S2: after Grain Seeds the same person may move to Farm Expansion and use it', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources = { ...state.players[0]!.resources, grain: 1, wood: 2 }
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'grain-seeds'), true)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('A129 S3: declining the Swagman jump leaves the person on Grain Seeds', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources.grain = 1
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'grain-seeds'), false)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toEqual([])
  })

  it('A129 S4: after Farm Expansion the same person may move to Grain Seeds and use it', () => {
    const session = setup('A129_Swagman', 3)
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)
    const response = driveSwagman(session, session.takeAction(0, 'farm-expansion'), true)
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

const setupMummysBoy = (secondSpaceId: string, family = 3) => {
  const session = setup('A130_MummysBoy', 3)
  const state = session.getState().state
  const owner = state.players[0]!
  setActiveWorkerCount(owner, family)
  setWorkersAtHome(state, owner, family)
  const first = state.actionSpaces.find((space) => space.id === 'forest')!
  const second = state.actionSpaces.find((space) => space.id === secondSpaceId)!
  first.takenBy = [{ playerId: owner.id, workerId: '1' }]
  second.takenBy = [{ playerId: owner.id, workerId: '2' }]
  recordRoundPlacement(owner, 'forest', '1')
  recordRoundPlacement(owner, secondSpaceId, '2')
  state.currentPlayerIndex = 0
  session.loadState(state)
  return session
}

describe("A130 Mummy's Boy parity", () => {
  it('A130 S1: the third person may reuse the action occupied by the second person', () => {
    const session = setupMummysBoy('day-laborer')
    const before = session.state.players[0]!.resources.food
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(before + 2)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(2)
  })

  it('A130 S2: Meeting Place occupied by the second person cannot be reused', () => {
    const session = setupMummysBoy('meeting-place')
    const response = session.takeAction(0, 'allow-occupied:meeting-place')
    expect(response.ok).toBe(false)
  })

  it("A130 S3: Mummy's Boy can reuse the second person's space only once per round", () => {
    const session = setupMummysBoy('day-laborer', 4)
    const first = session.takeAction(0, 'day-laborer')
    expect(first.ok, first.error).toBe(true)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)
    const second = session.takeAction(0, 'day-laborer')
    expect(second.ok).toBe(false)
  })
})
