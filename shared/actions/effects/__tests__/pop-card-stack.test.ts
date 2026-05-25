import { describe, expect, it } from 'vitest'
import { popCardStackAction } from '../internal/pop-card-stack'
import { assertKnownGameEventShape } from '../../../events/guards'
import type { ActionSpace, GameState, PlayerState, Resource } from '../../../contract/types'
import type { DraftGameEvent, EventSink } from '../../../contract/events'

const CARD_ID = 'B19_MoldboardPlow'

const makePlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    } as Resource,
    rooms: 2, houseType: 'wood', fields: [], fences: 0,
    roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false, activeModifiers: [],
    cardStates: { [CARD_ID]: { stack: ['field'] } },
  }) as PlayerState

const makeSink = (events: DraftGameEvent[]): EventSink => ({
  emit: (event) => { events.push(event) },
  emitMany: (nextEvents) => { events.push(...nextEvents) },
})

describe('pop-card-stack', () => {
  it('pops pseudo field tokens without emitting invalid resource events', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []

    const result = popCardStackAction.execute({
      state: { players: [player], actionSpaces: [] } as GameState,
      player,
      space: { id: 'pop-card-stack' } as ActionSpace,
      sourceCard: CARD_ID,
      eventSink: makeSink(events),
    })

    expect(result).toEqual({ type: 'ok' })
    expect(player.cardStates?.[CARD_ID]?.stack).toEqual([])
    expect(player.resources).toEqual({
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.stackChanged',
        cardId: CARD_ID,
        targetPlayerId: player.id,
        delta: -1,
        reason: 'take',
      }),
    ])
    expect(events[0]).not.toHaveProperty('resources')
    events.forEach((event) => {
      expect(() => assertKnownGameEventShape({
        schemaVersion: 1,
        id: 'test',
        seq: 1,
        round: 1,
        phase: 'work',
        visibility: 'public',
        ...event,
      })).not.toThrow()
    })
  })
})
