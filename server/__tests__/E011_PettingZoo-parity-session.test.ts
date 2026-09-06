import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E011_PettingZoo'

const CARD_ID = 'E011_PettingZoo'
const CARD_ZONE_ID = `card:${CARD_ID}`
const FILLER = '__test_placeholder__'

type AnimalCounts = Partial<Record<'sheep' | 'boar' | 'cattle', number>>

const roomTiles = (rooms: number) => Array.from({ length: rooms }, (_, row) => ({ row, col: 0 }))

const setup = ({
  played = false,
  wood = 1,
  rooms = 2,
  pastureTile = null as { row: number; col: number } | null,
} = {}) => {
  const session = new GameSession(7011, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.pastures = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })

  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  owner.rooms = rooms
  owner.roomTiles = roomTiles(rooms)
  owner.pastures = pastureTile === null ? [] : [{
    id: 'petting-zoo-pasture',
    size: 1,
    tiles: [pastureTile],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const openReorganization = (session: GameSession, animals: AnimalCounts) => {
  const response = session.devSetResources(0, animals)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  return response
}

const cardZone = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  return response.interaction.request.zones.find((zone) => zone.id === CARD_ZONE_ID)
}

const assignment = (counts: AnimalCounts) => ({
  id: CARD_ZONE_ID,
  zoneType: 'card' as const,
  cardId: CARD_ID,
  animalType: null,
  animalCount: Object.values(counts).reduce((total, count) => total + (count ?? 0), 0),
  animalCounts: counts,
})

const heldAnimals = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts

describe('E011 Petting Zoo parity', () => {
  it('E011 S1: paying one wood plays Petting Zoo', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E011 S2: without one wood Petting Zoo remains unavailable', () => {
    const response = enterMinor(setup({ wood: 0 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E011 S3: beside an adjacent pasture a two-room Petting Zoo holds two different animal types', () => {
    const session = setup({ played: true, pastureTile: { row: 0, col: 1 } })
    const pending = openReorganization(session, { sheep: 1, boar: 1, cattle: 1 })

    expect(cardZone(pending)).toMatchObject({ capacity: 2, allowedAnimalType: null })
    const response = session.resolveChoice(0, 'confirm', [
      assignment({ sheep: 1, boar: 1 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(heldAnimals(response)).toEqual({ sheep: 1, boar: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 0 })
  })

  it('E011 S4: assigning more animals than the room-count capacity is accepted, clipped, and completes', () => {
    const session = setup({ played: true, pastureTile: { row: 0, col: 1 } })
    const pending = openReorganization(session, { sheep: 1, boar: 1, cattle: 1 })

    const response = session.resolveChoice(0, 'confirm', [
      assignment({ sheep: 1, boar: 1, cattle: 1 }),
    ] as unknown as Record<string, unknown>)
    expect(response.ok, response.error).toBe(true)
    expect(heldAnimals(response)).toEqual({ sheep: 1, boar: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 0 })
    expect(response.interaction.stateId).toBe('idle')
    expect(session.resolveChoice(0, 'confirm', [
      assignment({ sheep: 1, boar: 1 }),
    ] as unknown as Record<string, unknown>).ok).toBe(false)
  })

  it('E011 S5: a three-room Petting Zoo can hold one sheep, one boar, and one cattle', () => {
    const session = setup({ played: true, rooms: 3, pastureTile: { row: 0, col: 1 } })
    const pending = openReorganization(session, { sheep: 1, boar: 1, cattle: 1 })

    expect(cardZone(pending)).toMatchObject({ capacity: 3, allowedAnimalType: null })
    const response = session.resolveChoice(0, 'confirm', [
      assignment({ sheep: 1, boar: 1, cattle: 1 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(heldAnimals(response)).toEqual({ sheep: 1, boar: 1, cattle: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
  })

  it('E011 S6: without a pasture Petting Zoo provides no animal zone', () => {
    const response = openReorganization(setup({ played: true }), { sheep: 1 })

    expect(cardZone(response)).toBeUndefined()
  })

  it('E011 S7: a nonadjacent pasture does not activate Petting Zoo', () => {
    const response = openReorganization(
      setup({ played: true, pastureTile: { row: 4, col: 4 } }),
      { sheep: 1 },
    )

    expect(cardZone(response)).toBeUndefined()
  })

  it('E011 S8: a pasture adjacent to the second room also activates Petting Zoo', () => {
    const session = setup({ played: true, pastureTile: { row: 1, col: 1 } })
    const pending = openReorganization(session, { sheep: 1 })

    expect(cardZone(pending)?.capacity).toBe(2)
    const response = session.resolveChoice(0, 'confirm', [
      assignment({ sheep: 1 }),
    ] as unknown as Record<string, unknown>)
    expect(response.ok, response.error).toBe(true)
    expect(heldAnimals(response)).toEqual({ sheep: 1 })
  })
})
