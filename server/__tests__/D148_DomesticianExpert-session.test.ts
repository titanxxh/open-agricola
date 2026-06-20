import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/D/D148_DomesticianExpert'
import '../../shared/cards/D/D12_MilkingPlace'

describe('D148_DomesticianExpert session', () => {
  const setup = (roomTiles?: Array<{row: number, col: number}>) => {
    const session = new GameSession()
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

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.cardStates?.D148_DomesticianExpert?.extraData).toMatchObject({
      held: 1,
      animalType: 'sheep',
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
    player.minorPlayed.push('D12_MilkingPlace')
    session.loadState(state)

    const zones = computeAnimalZones(state.players[0]!)
    expect(zones.find(z => z.id === 'card:D148_DomesticianExpert')).toBeUndefined()
    // D12 also strips the house zone
    expect(zones.find(z => z.zoneType === 'house')).toBeUndefined()
  })
})
