import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/actions/helpers/animal-zones'

import '../../shared/cards/E/E36_HerbalGarden'

const CARD_ID = 'E36_HerbalGarden'

describe('E36_HerbalGarden session', () => {
  it('with 2 pastures, one pasture has capacity 0 after card played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!

    player.minorPlayed.push(CARD_ID)

    // Set up 2 pastures
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'pasture-2',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    const updatedPlayer = session.getState().state.players[0]!

    const zones = computeAnimalZones(updatedPlayer)
    const pastureZones = zones.filter(z => z.zoneType === 'pasture')
    expect(pastureZones.length).toBe(2)

    // At least one pasture should have capacity 0
    const blockedPastures = pastureZones.filter(z => z.capacity === 0)
    expect(blockedPastures.length).toBe(1)

    // The other pasture should have normal capacity
    const normalPastures = pastureZones.filter(z => z.capacity > 0)
    expect(normalPastures.length).toBe(1)
  })

  it('prefers to block an already-empty pasture', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!

    player.minorPlayed.push(CARD_ID)

    // Pasture 1 has animals, pasture 2 is empty
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
      {
        id: 'pasture-2',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    const updatedPlayer = session.getState().state.players[0]!

    const zones = computeAnimalZones(updatedPlayer)
    const pastureZones = zones.filter(z => z.zoneType === 'pasture')

    // The empty pasture (pasture-2) should be the one blocked
    const blockedPasture = pastureZones.find(z => z.capacity === 0)
    expect(blockedPasture).toBeDefined()
    expect(blockedPasture!.id).toBe('pasture-2')

    // The pasture with animals should retain its capacity
    const sheepPasture = pastureZones.find(z => z.id === 'pasture-1')
    expect(sheepPasture).toBeDefined()
    expect(sheepPasture!.capacity).toBe(4) // size 2 * 2 = 4
  })

  it('without card, all pastures have normal capacity', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!

    // Card NOT played
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'pasture-2',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    const updatedPlayer = session.getState().state.players[0]!

    const zones = computeAnimalZones(updatedPlayer)
    const pastureZones = zones.filter(z => z.zoneType === 'pasture')
    expect(pastureZones.length).toBe(2)

    // All pastures should have normal capacity
    expect(pastureZones.every(z => z.capacity > 0)).toBe(true)
  })

  it('no pastures → no effect', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!

    player.minorPlayed.push(CARD_ID)
    player.pastures = []

    session.loadState(state)
    const updatedPlayer = session.getState().state.players[0]!

    const zones = computeAnimalZones(updatedPlayer)
    const pastureZones = zones.filter(z => z.zoneType === 'pasture')
    expect(pastureZones.length).toBe(0) // no pastures, no effect
  })

  it('single pasture gets blocked', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!

    player.minorPlayed.push(CARD_ID)

    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 3,
      },
    ]

    session.loadState(state)
    const updatedPlayer = session.getState().state.players[0]!

    const zones = computeAnimalZones(updatedPlayer)
    const pastureZones = zones.filter(z => z.zoneType === 'pasture')
    expect(pastureZones.length).toBe(1)
    // The only pasture must be blocked
    expect(pastureZones[0]!.capacity).toBe(0)
  })
})
