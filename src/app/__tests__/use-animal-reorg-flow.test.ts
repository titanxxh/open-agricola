import { describe, expect, it } from 'vitest'
import type { PlayerState, Resource } from '../../game/types'
import type { AnimalReorgState, PendingAnimalReorg } from '../../types/ui'
import {
  applyAnimalReorgToPlayer,
  buildPendingChoiceFromReorgProgress,
} from '../hooks/use-animal-reorg-flow'

const resources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const player = (): PlayerState => ({
  id: 'p1',
  name: 'p1',
  color: 'red',
  resources: resources(),
  familySize: 2,
  workersAvailable: 0,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
  pastures: [
    {
      id: 'pasture-1',
      size: 1,
      tiles: [],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
    {
      id: 'pasture-2',
      size: 1,
      tiles: [],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    },
  ],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const animalReorgState = (): AnimalReorgState => ({
  confirmDiscard: false,
  zones: [
    { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 4 },
    { id: 'pasture-2', zoneType: 'pasture', animalType: null, animalCount: 0 },
    { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 3 },
    { id: 'stable:1-1', zoneType: 'stable', animalType: 'cattle', animalCount: 1 },
  ],
})

describe('use-animal-reorg-flow helpers', () => {
  it('applies animal assignments with pasture capacity clamp', () => {
    const target = player()
    applyAnimalReorgToPlayer({
      player: target,
      animalReorg: animalReorgState(),
      totals: { sheep: 1, boar: 3, cattle: 1 },
      getPastureCapacity: (pasture) => (pasture.id === 'pasture-1' ? 2 : 1),
    })
    expect(target.pastures[0].animalType).toBe('boar')
    expect(target.pastures[0].animalCount).toBe(2)
    expect(target.pastures[1].animalType).toBeNull()
    expect(target.pastures[1].animalCount).toBe(0)
  })

  it('writes back house, stable and resource totals', () => {
    const target = player()
    applyAnimalReorgToPlayer({
      player: target,
      animalReorg: animalReorgState(),
      totals: { sheep: 5, boar: 2, cattle: 4 },
      getPastureCapacity: () => 2,
    })
    expect(target.houseAnimalType).toBe('sheep')
    expect(target.houseAnimalCount).toBe(1)
    expect(target.stableAnimals['1-1']).toBe('cattle')
    expect(target.resources.sheep).toBe(5)
    expect(target.resources.boar).toBe(2)
    expect(target.resources.cattle).toBe(4)
  })

  it('builds pending choice with farm-redevelopment fence bonus', () => {
    const pending: PendingAnimalReorg = { playerIndex: 1, spaceId: 'farm-redevelopment' }
    const choice = buildPendingChoiceFromReorgProgress(
      {
        promptKey: 'ui.interactionFenceSelect',
        choice: [{ value: 'x', labelKey: 'x' }],
      },
      pending,
    )
    expect(choice.playerIndex).toBe(1)
    expect(choice.fenceExtraWood).toBe(1)
  })
})
