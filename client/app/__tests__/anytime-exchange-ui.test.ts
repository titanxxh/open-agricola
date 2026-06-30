import { describe, expect, it } from 'vitest'

import type { ActionChoiceOption, PlayerState } from '../../../shared/contract/types'
import { emptyResources } from '../../../shared/contract/state-constants'
import { buildAnytimeExchangeBulkChoice, buildAnytimeExchangeOptions } from '../anytime-exchange-ui'

const mkPlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: { ...emptyResources },
    workers: [],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    stats: {} as PlayerState['stats'],
    ...overrides,
  }) as PlayerState

const serverOption = (
  value: string,
  sourceCard: string,
  resourcesPaid: Record<string, number>,
  resourcesGained: Record<string, number>,
): ActionChoiceOption => ({
  value,
  labelKey: value,
  sourceCard,
  effectPreview: {
    kind: 'resourceExchange',
    resourcesPaid,
    resourcesGained,
  },
})

describe('anytime exchange UI helpers', () => {
  it('keeps all metadata-backed anytime rows while wiring affordable rows to server trade indexes', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, boar: 2, cattle: 1 },
      improvements: ['Major_CookingHearth1'],
    })
    const options = buildAnytimeExchangeOptions(
      player,
      [
        serverOption('trade:1:2', 'Major_CookingHearth1', { boar: 2 }, { food: 6 }),
        serverOption('trade:2:1', 'Major_CookingHearth1', { cattle: 1 }, { food: 4 }),
        { value: 'cancel', labelKey: 'ui.interactionCancel' },
      ],
      (id) => id,
      (id) =>
        id === 'Major_CookingHearth1'
          ? {
              exchanges: [
                { from: { sheep: 1 }, to: { food: 2 }, triggers: ['anytime'] },
                { from: { boar: 1 }, to: { food: 3 }, triggers: ['anytime'] },
                { from: { cattle: 1 }, to: { food: 4 }, triggers: ['anytime'] },
                { from: { vegetable: 1 }, to: { food: 3 }, triggers: ['anytime'] },
              ],
            }
          : undefined,
    )

    expect(options.map((option) => option.id)).toEqual([
      'Major_CookingHearth1-ex0',
      'Major_CookingHearth1-ex1',
      'Major_CookingHearth1-ex2',
      'Major_CookingHearth1-ex3',
    ])
    expect(options.map((option) => option.tradeIndex)).toEqual([undefined, 1, 2, undefined])
    expect(options.map((option) => option.maxTimes)).toEqual([0, 2, 1, 0])
  })

  it('builds a bulk choice from selected anytime exchange rows', () => {
    const options = [
      { id: 'sheep', tradeIndex: 0, maxTimes: 1 },
      { id: 'boar', tradeIndex: 1, maxTimes: 2 },
      { id: 'vegetable', maxTimes: 0 },
    ]

    expect(buildAnytimeExchangeBulkChoice({ sheep: 0, boar: 2, vegetable: 1 }, options)).toBe('bulk:1=2')
    expect(buildAnytimeExchangeBulkChoice({ sheep: 0 }, options)).toBeNull()
  })
})
