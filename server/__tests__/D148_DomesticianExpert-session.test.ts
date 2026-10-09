import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/D/D148_DomesticianExpert'
import '../../shared/cards/D/D012_MilkingPlace'

describe('D148_DomesticianExpert session', () => {
  const setup = (roomTiles?: Array<{row: number, col: number}>) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D148_DomesticianExpert')

    if (roomTiles) {
      player.roomTiles = roomTiles
      player.rooms = roomTiles.length
    }

    session.loadState(state)
    session.devPlayCard(0, 'D148_DomesticianExpert')
    return session
  }

  it('1 adjacent pair gives capacity 2', () => {
    // Two vertically adjacent rooms
    const session = setup([{ row: 0, col: 0 }, { row: 1, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:D148_DomesticianExpert')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('sheep')
  })

  it('2 adjacent pairs gives capacity 4', () => {
    // L-shape: (0,0)-(0,1) and (0,0)-(1,0) = 2 pairs
    const session = setup([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:D148_DomesticianExpert')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(4)
  })

  it('animalType restricted to sheep', () => {
    const session = setup([{ row: 0, col: 0 }, { row: 1, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:D148_DomesticianExpert')
    expect(cardZone).toBeDefined()
    expect(cardZone!.animalType).toBe('sheep')
  })

  it('rejects non-sheep assignments after it already contains sheep', () => {
    const session = setup([{ row: 0, col: 0 }, { row: 1, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 1
    player.cardStates = {
      ...(player.cardStates ?? {}),
      D148_DomesticianExpert: { extraData: { held: 1, animalType: 'sheep' } },
    }
    session.loadState(state)

    let resp = session.devSetResources(0, { sheep: 1, boar: 1 })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    const beforeInteraction = resp.interaction
    const before = session.getState()

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        {
          id: 'card:D148_DomesticianExpert',
          zoneType: 'card',
          cardId: 'D148_DomesticianExpert',
          animalType: null,
          animalCount: 2,
          animalCounts: { sheep: 1, boar: 1 },
        },
      ],
    })

    expect(resp.ok).toBe(false)
    expect(resp.state).toEqual(before.state)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: beforeInteraction.playerIndex,
      request: beforeInteraction.request,
    })
  })

  it('default 2 rooms are adjacent — zone exists', () => {
    // Use default room tiles (no override)
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Default rooms: (2,0) and (1,0) — vertically adjacent
    expect(player.roomTiles.length).toBe(2)

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:D148_DomesticianExpert')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })

  it('no zone when single room (no adjacent pairs)', () => {
    const session = setup([{ row: 0, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:D148_DomesticianExpert')
    expect(cardZone).toBeUndefined()
  })

  it('negated by D12 MilkingPlace — adds no zone when D12 is also played', () => {
    // 2 adjacent rooms — D148 alone would add capacity 2
    const session = setup([{ row: 0, col: 0 }, { row: 1, col: 0 }])
    const state = session.getState().state
    const player = state.players[0]!
    // Mark D12 as played (no need to run buy flow — zone hooks read minorPlayed)
    player.minorPlayed.push('D012_MilkingPlace')
    session.loadState(state)

    const zones = computeAnimalZones(state.players[0]!)
    expect(zones.find(z => z.id === 'card:D148_DomesticianExpert')).toBeUndefined()
    // D12 also strips the house zone
    expect(zones.find(z => z.zoneType === 'house')).toBeUndefined()
  })
})

describe('D148 Domestician Expert parity', () => {
  const CARD_ID = 'D148_DomesticianExpert'

  const CARD_ZONE = `card:${CARD_ID}`

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, sheep = 0, boar = 0, extraRoom = false, milkingPlace = false } = {}) => {
    const session = new GameSession(6148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const player = state.players[0]!
    player.occupationHand = played ? [FILLER] : [CARD_ID]
    player.occupationPlayed = played ? [CARD_ID] : []
    if (extraRoom) {
      player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }]
      player.rooms = 3
    }
    if (milkingPlace) player.minorPlayed.push('D012_MilkingPlace')
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = sheep
    state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = boar
    session.loadState(state)
    return session
  }

  const cardZone = (response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      return undefined
    }
    return response.interaction.request.zones.find((zone) => zone.id === CARD_ZONE)
  }

  const assignToCard = (response: SessionResponse, animalType: 'sheep' | 'boar', animalCount: number) => ({
    ...cardZone(response)!, animalType, animalCount, animalCounts: { [animalType]: animalCount },
  })

  it('D148 S2: one adjacent room pair holds two sheep on their shared border', () => {
    const session = setup({ sheep: 2 })
    const pending = session.takeAction(0, 'sheep-market')
    expect(cardZone(pending)).toMatchObject({ capacity: 2, allowedAnimalType: 'sheep' })

    const response = session.resolveChoice(0, 'confirm', {
      zones: [assignToCard(pending, 'sheep', 2)],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData).toMatchObject({
      held: 2, animalType: 'sheep',
    })
  })

  it('D148 S3: two adjacent room pairs hold four sheep', () => {
    const session = setup({ sheep: 4, extraRoom: true })
    const pending = session.takeAction(0, 'sheep-market')
    expect(cardZone(pending)).toMatchObject({ capacity: 4, allowedAnimalType: 'sheep' })

    const response = session.resolveChoice(0, 'confirm', {
      zones: [assignToCard(pending, 'sheep', 4)],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData).toMatchObject({
      held: 4, animalType: 'sheep',
    })
  })

  it('D148 S4: a room border rejects boars while the ordinary house holds only one', () => {
    const session = setup({ boar: 2 })
    const pending = session.takeAction(0, 'pig-market')
    expect(cardZone(pending)).toMatchObject({ capacity: 2, allowedAnimalType: 'sheep' })

    const rejected = session.resolveChoice(0, 'confirm', {
      zones: [assignToCard(pending, 'boar', 2)],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)

    const response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 }],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it('D148 S5: Milking Place removes the Domestician Expert room-border zone', () => {
    const response = setup({ sheep: 1, milkingPlace: true }).takeAction(0, 'sheep-market')

    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    expect(cardZone(response)).toBeUndefined()
  })
})
