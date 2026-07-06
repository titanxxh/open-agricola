import { describe, expect, it } from 'vitest'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import type { GameState, PlayerState } from '../../../contract/types'
import { createInitialPlayerStats } from '../../../session/stats'
import { commitImprovementPurchaseLifecycle } from '../improvement-purchase-lifecycle'

import '../../../cards/A/A001_Shelter'

const resources = {
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
}

const makePlayer = (id: string, overrides: Partial<PlayerState> = {}): PlayerState => ({
  id,
  name: id,
  color: id,
  resources: { ...resources },
  workers: [],
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
  extraOccupationsFromCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: createInitialPlayerStats({ isFirstPlayer: false }),
  ...overrides,
})

const makeState = (players: PlayerState[]): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players,
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: ['Major_CookingHearth1'],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
} as never)

const eventSink = () => {
  const events: DraftGameEvent[] = []
  const sink: EventSink = {
    emit: (event) => { events.push(event) },
    emitMany: (items) => { events.push(...items) },
  }
  return { events, sink }
}

describe('commitImprovementPurchaseLifecycle', () => {
  it('commits a major improvement with returned card, event, and improvementPayment', () => {
    const player = makePlayer('p1', { improvements: ['Major_Fireplace1'] })
    const state = makeState([player])
    const { events, sink } = eventSink()

    const result = commitImprovementPurchaseLifecycle({
      state,
      player,
      kind: 'major',
      improvementId: 'Major_CookingHearth1',
      paymentInfo: {
        resourcesPaid: {},
        returnedCardId: 'Major_Fireplace1',
      },
      eventSink: sink,
    })

    expect(result.type).toBe('ok')
    expect(player.improvements).toEqual(['Major_CookingHearth1'])
    expect(state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(state.availableMajorImprovements).not.toContain('Major_CookingHearth1')
    expect(result.extraData?.improvementPayment).toEqual({
      improvementId: 'Major_CookingHearth1',
      resourcesPaid: {},
      returnedCardId: 'Major_Fireplace1',
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.played',
        cardId: 'Major_CookingHearth1',
        cardType: 'major',
      }),
    ])
  })

  it('commits a passing minor without treating it as played', () => {
    const player = makePlayer('p1', { minorHand: ['A001_Shelter'] })
    const nextPlayer = makePlayer('p2')
    const state = makeState([player, nextPlayer])
    const { events, sink } = eventSink()

    const result = commitImprovementPurchaseLifecycle({
      state,
      player,
      kind: 'minor',
      improvementId: 'A001_Shelter',
      paymentInfo: { resourcesPaid: {} },
      eventSink: sink,
    })

    expect(result.type).toBe('ok')
    expect(player.minorHand).not.toContain('A001_Shelter')
    expect(player.minorPlayed).not.toContain('A001_Shelter')
    expect(player.stats.totalMinorBuilt).toBe(0)
    expect(nextPlayer.minorHand).toContain('A001_Shelter')
    expect(result.extraData?.improvementPayment).toEqual({
      improvementId: 'A001_Shelter',
      resourcesPaid: {},
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.passed',
        cardId: 'A001_Shelter',
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
      }),
    ])
  })
})
