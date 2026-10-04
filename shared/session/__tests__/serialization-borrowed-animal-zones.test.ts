import '../../cards/__tests__/setup-register-all'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { stabilizeRandomHands } from '../../../server/__tests__/_helpers/stabilize-random-hands'
import { getCardEffect } from '../../cards/card-effects'
import { EngineStack } from '../../engine'
import { createInitialState } from '../state-bootstrap'
import { serializeSessionSnapshot, serializeState, serializeStateForPlayer } from '../serialization'

const emptyCtx = () => ({ engineStack: new EngineStack() })

afterEach(() => vi.restoreAllMocks())

describe('borrowed played-card animal zones serialization', () => {
  it('projects M033 borrowed animal zones for non-owner player snapshots', () => {
    const state = createInitialState(33033, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const owner = state.players[0]!
    const viewer = state.players[1]!
    owner.name = 'Owner'
    viewer.name = 'Viewer'
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = { M033_NightPasture: { extraData: {} } }

    const serialized = serializeState(state, emptyCtx())

    expect(serialized.players[0]!.borrowedPlayedCardAnimalZones).toEqual([])
    expect(serialized.players[1]!.borrowedPlayedCardAnimalZones).toEqual([
      {
        id: 'card:M033_NightPasture:owner:p1:animalOwner:p2',
        zoneType: 'card',
        cardId: 'M033_NightPasture',
        ownerPlayerId: 'p1',
        animalOwnerPlayerId: 'p2',
        displayOwnerName: 'Owner',
        displaySource: 'borrowed-played-card',
        animalType: null,
        animalCount: 0,
        capacity: 1,
        allowedAnimalType: null,
      },
    ])

    const viewerSnapshot = serializeStateForPlayer(state, viewer.id, emptyCtx())
    expect(viewerSnapshot.players[1]!.borrowedPlayedCardAnimalZones).toEqual(
      serialized.players[1]!.borrowedPlayedCardAnimalZones,
    )
  })

  it('projects owned played-card animal zones for owner snapshots', () => {
    const state = createInitialState(33034, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const owner = state.players[0]!
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = { M033_NightPasture: { extraData: {} } }

    const serialized = serializeState(state, emptyCtx())

    expect(serialized.players[0]!.playedCardAnimalZones).toEqual([
      {
        id: 'card:M033_NightPasture:owner:p1:animalOwner:p1',
        zoneType: 'card',
        cardId: 'M033_NightPasture',
        ownerPlayerId: 'p1',
        animalOwnerPlayerId: 'p1',
        displaySource: 'played-card',
        animalType: null,
        animalCount: 0,
        capacity: 3,
        allowedAnimalType: null,
      },
    ])
  })

  it('projects empty farm-position card animal zones for owner snapshots', () => {
    const state = createInitialState(33035, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = state.players[0]!
    player.minorPlayed = ['M035_HorseTrough']

    const serialized = serializeState(state, emptyCtx())
    const farmZones = serialized.players[0]!.farmCardAnimalZones

    expect(farmZones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          zoneType: 'card',
          cardId: 'M035_HorseTrough',
          displaySource: 'farm-position',
          animalType: 'horse',
          animalCount: 0,
          capacity: 2,
          allowedAnimalType: 'horse',
        }),
      ]),
    )
  })

  it.each(['viewer', 'persistence'] as const)('computes one zone view per player and refreshes the next %s snapshot', (mode) => {
    const session = new GameSession(33036, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    try {
      stabilizeRandomHands(session.state.players)
      const owner = session.state.players[0]!
      const viewer = session.state.players[1]!
      owner.name = 'Owner'
      owner.minorPlayed = ['M033_NightPasture', 'M035_HorseTrough', 'A012_DrinkingTrough']
      const ownedZoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${owner.id}`
      owner.cardStates.M033_NightPasture = { extraData: {
        animalCountsByZone: { [ownedZoneId]: { animalCounts: { sheep: 2 } } },
      } }
      owner.pastures = [{
        id: 'test-pasture', size: 1, stables: 0, animalType: 'sheep', animalCount: 2,
        tiles: [{ row: 0, col: 2 }],
      }]
      const effect = session.withCtx(() => getCardEffect('M033_NightPasture'))!
      const ownQuery = vi.spyOn(effect, 'onComputeAnimalZones')
      const sharedQuery = vi.spyOn(effect, 'onComputeSharedAnimalZones')
      const snapshot = () => mode === 'persistence'
        ? serializeSessionSnapshot(session.state, session).frame
        : session.withCtx(() => serializeStateForPlayer(session.state, viewer.id, emptyCtx()))
      const before = JSON.stringify(session.state)

      const first = snapshot()

      expect(ownQuery).toHaveBeenCalledOnce()
      expect(sharedQuery).toHaveBeenCalledOnce()
      expect(JSON.stringify(session.state)).toBe(before)
      expect(first.players[0]!.pastureCapacities).toEqual({ 'test-pasture': 4 })
      expect(first.players[0]!.playedCardAnimalZones).toEqual([
        expect.objectContaining({ id: ownedZoneId, capacity: 3, animalType: 'sheep', animalCount: 2 }),
      ])
      expect(first.players[0]!.farmCardAnimalZones).toEqual(expect.arrayContaining([
        expect.objectContaining({ cardId: 'M035_HorseTrough', capacity: 2, displaySource: 'farm-position' }),
      ]))
      expect(first.players[1]!.borrowedPlayedCardAnimalZones).toEqual([
        expect.objectContaining({ cardId: 'M033_NightPasture', displayOwnerName: 'Owner', capacity: 1 }),
      ])

      owner.name = 'Renamed owner'
      owner.pastures[0]!.stables = 1
      owner.cardStates.M033_NightPasture.extraData = {
        animalCountsByZone: { [ownedZoneId]: { animalCounts: { sheep: 1 } } },
      }
      const second = snapshot()

      expect(ownQuery).toHaveBeenCalledTimes(2)
      expect(sharedQuery).toHaveBeenCalledTimes(2)
      expect(second.players[0]!.pastureCapacities).toEqual({ 'test-pasture': 6 })
      expect(second.players[0]!.playedCardAnimalZones[0]!.animalCount).toBe(1)
      expect(second.players[1]!.borrowedPlayedCardAnimalZones[0]!.displayOwnerName).toBe('Renamed owner')
      expect(first.players[0]!.pastureCapacities).toEqual({ 'test-pasture': 4 })
      expect(first.players[0]!.playedCardAnimalZones[0]!.animalCount).toBe(2)
      expect(first.players[1]!.borrowedPlayedCardAnimalZones[0]!.displayOwnerName).toBe('Owner')
    } finally {
      session.dispose()
    }
  })
})
