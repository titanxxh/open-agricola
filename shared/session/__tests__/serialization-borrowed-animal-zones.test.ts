import '../../cards/__tests__/setup-register-all'

import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import { createInitialState } from '../state-bootstrap'
import { serializeState, serializeStateForPlayer } from '../serialization'

const emptyCtx = () => ({ engineStack: new EngineStack() })

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
})
