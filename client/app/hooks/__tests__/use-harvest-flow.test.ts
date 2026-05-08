import { describe, expect, it } from 'vitest'
import { buildHarvestFeedOptions } from '../use-harvest-flow'
import { emptyResources } from '../../../../shared/logic/state-constants'
import type { PlayerState } from '../../../../shared/contract/types'
import '../../../../shared/cards/C/C59_SchnappsDistillery'
import '../../../../shared/cards/B/B104_SheepWalker'

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

const cardLabel = (id: string) => id

describe('buildHarvestFeedOptions', () => {
  it('lists basic conversion when player holds grain/vegetable', () => {
    const player = mkPlayer({ resources: { ...emptyResources, grain: 1, vegetable: 1 } })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.find((o) => o.sourceId === '__basic__' && o.exchangeIndex === 0)).toBeDefined()
    expect(options.find((o) => o.sourceId === '__basic__' && o.exchangeIndex === 1)).toBeDefined()
  })

  it('omits basic conversion entries when player has no grain/vegetable', () => {
    const player = mkPlayer({ resources: { ...emptyResources, grain: 0, vegetable: 0 } })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.filter((o) => o.sourceId === '__basic__')).toHaveLength(0)
  })

  it('lists harvest-trigger card exchanges (existing behaviour)', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, vegetable: 1 },
      minorPlayed: ['C59_SchnappsDistillery'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.find((o) => o.sourceId === 'C59_SchnappsDistillery')).toBeDefined()
  })

  it('lists anytime card exchanges (e.g. B104 SheepWalker)', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, sheep: 1 },
      occupationPlayed: ['B104_SheepWalker'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    const sheepWalker = options.filter((o) => o.sourceId === 'B104_SheepWalker')
    expect(sheepWalker.length).toBeGreaterThan(0)
  })

  it('skips exchanges whose from resources player cannot afford', () => {
    const player = mkPlayer({
      resources: { ...emptyResources, sheep: 0 },
      occupationPlayed: ['B104_SheepWalker'],
    })
    const options = buildHarvestFeedOptions(player, 'en', cardLabel)
    expect(options.filter((o) => o.sourceId === 'B104_SheepWalker')).toHaveLength(0)
  })
})
