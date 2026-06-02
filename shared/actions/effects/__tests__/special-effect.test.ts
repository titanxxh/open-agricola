import { describe, it, expect } from 'vitest'
import { specialEffectAction } from '../special-effect'
import { GameSession } from '../../../../server/game/authoritative-session'
import {
  readCardExtraData,
  readCardInfobox,
  isCardFlagged,
} from '../../../cards/helpers/card-state'
import { storePendingFenceBonus } from '../../../cards/helpers/pending-fence-bonus'
import { hasPendingExtraTurn } from '../../../cards/card-effects'
import { A92_AdoptiveParents } from '../../../cards-display/A/A92_AdoptiveParents'
import { setActiveWorkerCount, setWorkersAtHome } from '../../../domain/player'
import type { ActionExecutionContext, PlayerState, Resource, GameState, ActionSpace } from '../../../contract/types'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import '../../../cards/A/A92_AdoptiveParents'

const makePlayer = (): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  } as Resource,
  rooms: 2, houseType: 'wood', fields: [], fences: 0,
  roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

const makeCtx = (
  player: PlayerState,
  params: unknown,
  sourceCard?: string,
  state: GameState = {} as GameState,
): ActionExecutionContext => ({
  state,
  player,
  space: { id: 'special-effect' } as ActionSpace,
  sourceCard,
  params: params as Record<string, unknown>,
})

const CARD_ID = 'TEST_CARD'
const A92 = A92_AdoptiveParents.id

const makeEventSink = (events: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    events.push(event)
  },
  emitMany: (nextEvents) => {
    events.push(...nextEvents)
  },
})

const placeholderHands = (state: {
  players: { minorHand: string[]; occupationHand: string[] }[]
}) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}

const setupExtraTurnPlayer = (over: {
  newborns?: number
  food?: number
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, 2)
  setWorkersAtHome(state, p0, 0)
  const newborns = over.newborns ?? 1
  const active = p0.workers
    .filter((w) => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  for (let i = 0; i < newborns && i < active.length; i++) active[i]!.isNewborn = true
  p0.occupationPlayed.push(A92)
  p0.resources.food = over.food ?? 2

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, 1)
  setWorkersAtHome(state, p1, 1)

  placeholderHands(state)
  session.loadState(state)
  const loaded = session.getState().state
  return { state: loaded, player: loaded.players[0]! }
}

describe('specialEffectAction — mutation dispatcher', () => {
  it('increment-extra-data: adds to existing counter, init from 0', () => {
    const player = makePlayer()
    let result = specialEffectAction.execute(
      makeCtx(player, { kind: 'increment-extra-data', key: 'foo', amount: 5 }, CARD_ID),
    )
    expect(result.type).toBe('ok')
    expect(readCardExtraData<number>(player, CARD_ID, 'foo')).toBe(5)

    result = specialEffectAction.execute(
      makeCtx(player, { kind: 'increment-extra-data', key: 'foo', amount: 3 }, CARD_ID),
    )
    expect(result.type).toBe('ok')
    expect(readCardExtraData<number>(player, CARD_ID, 'foo')).toBe(8)
  })

  it('set-extra-data: overwrites value with arbitrary payload', () => {
    const player = makePlayer()
    specialEffectAction.execute(
      makeCtx(player, { kind: 'set-extra-data', key: 'foo', value: 'hello' }, CARD_ID),
    )
    expect(readCardExtraData(player, CARD_ID, 'foo')).toBe('hello')
    specialEffectAction.execute(
      makeCtx(player, { kind: 'set-extra-data', key: 'foo', value: { nested: 1 } }, CARD_ID),
    )
    expect(readCardExtraData(player, CARD_ID, 'foo')).toEqual({ nested: 1 })
  })

  it('record-scoring-reserve-bonus: records selected scoring reserve on the target player without spending resources', () => {
    const actor = makePlayer()
    const target = { ...makePlayer(), id: 'p2', name: 'P2', cardStates: {} }
    target.resources.wood = 3
    target.resources.clay = 1
    const state = { players: [actor, target] } as GameState

    const result = specialEffectAction.execute({
      ...makeCtx(actor, {
        kind: 'record-scoring-reserve-bonus',
        reserved: { wood: 2, clay: 1 },
        score: 3,
      }, CARD_ID, state),
      actionContext: { targetPlayerId: target.id },
    })

    expect(result.type).toBe('ok')
    expect(readCardExtraData(target, CARD_ID, 'scoringReserveBonus')).toEqual({
      reserved: { wood: 2, clay: 1 },
      score: 3,
    })
    expect(target.resources.wood).toBe(3)
    expect(target.resources.clay).toBe(1)
    expect(actor.cardStates).toEqual({})
  })

  it('record-scoring-reserve-bonus: rejects reserve above remaining resources after existing scoring reserve', () => {
    const player = makePlayer()
    player.resources.wood = 3
    player.cardStates = {
      OTHER_CARD: {
        extraData: {
          scoringReserveBonus: {
            reserved: { wood: 2 },
            score: 1,
          },
        },
      },
    }

    const result = specialEffectAction.execute(
      makeCtx(player, {
        kind: 'record-scoring-reserve-bonus',
        reserved: { wood: 2 },
        score: 3,
      }, CARD_ID, { players: [player] } as GameState),
    )

    expect(result.type).toBe('fail')
    expect(readCardExtraData(player, CARD_ID, 'scoringReserveBonus')).toBeUndefined()
  })

  it('record-scoring-reserve-bonus: writes no scoring state for empty reserve with zero score', () => {
    const player = makePlayer()

    const result = specialEffectAction.execute(
      makeCtx(player, {
        kind: 'record-scoring-reserve-bonus',
        reserved: {},
        score: 0,
      }, CARD_ID, { players: [player] } as GameState),
    )

    expect(result.type).toBe('ok')
    expect(player.cardStates).toEqual({})
  })

  it('record-scoring-reserve-bonus: rejects negative or fractional reserve amounts', () => {
    const player = makePlayer()
    player.resources.wood = 3

    const negative = specialEffectAction.execute(
      makeCtx(player, {
        kind: 'record-scoring-reserve-bonus',
        reserved: { wood: -1 },
        score: 1,
      }, CARD_ID, { players: [player] } as GameState),
    )
    const fractional = specialEffectAction.execute(
      makeCtx(player, {
        kind: 'record-scoring-reserve-bonus',
        reserved: { wood: 1.5 },
        score: 1,
      }, CARD_ID, { players: [player] } as GameState),
    )

    expect(negative.type).toBe('fail')
    expect(fractional.type).toBe('fail')
    expect(readCardExtraData(player, CARD_ID, 'scoringReserveBonus')).toBeUndefined()
  })

  it('record-scoring-reserve-bonus: accepts real resource kinds chosen by the source card flow', () => {
    const player = makePlayer()
    player.resources.sheep = 2

    const result = specialEffectAction.execute(
      makeCtx(player, {
        kind: 'record-scoring-reserve-bonus',
        reserved: { sheep: 1 },
        score: 1,
      }, CARD_ID, { players: [player] } as GameState),
    )

    expect(result.type).toBe('ok')
    expect(readCardExtraData(player, CARD_ID, 'scoringReserveBonus')).toEqual({
      reserved: { sheep: 1 },
      score: 1,
    })
  })

  it('set-extra-data: emits public literal state changes only', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'set-extra-data', key: 'foo', value: 'hello' }, CARD_ID),
      eventSink: makeEventSink(events),
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'set-extra-data', key: 'foo', value: { privateHand: ['E1'] } }, CARD_ID),
      eventSink: makeEventSink(events),
    })

    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.stateChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        key: 'foo',
        value: 'hello',
      }),
    ])
    expect(readCardExtraData(player, CARD_ID, 'foo')).toEqual({ privateHand: ['E1'] })
  })

  it('emits card state events for public counter and flag mutations', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    const eventSink = makeEventSink(events)

    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'increment-extra-data', key: 'foo', amount: 5 }, CARD_ID),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'increment-counter', key: 'uses', amount: 2 }, CARD_ID),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'set-counter', key: 'uses', value: 4 }, CARD_ID),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'set-flag', flag: true }, CARD_ID),
      eventSink,
    })

    expect(events).toEqual([
      expect.objectContaining({ type: 'card.stateChanged', key: 'foo', value: 5 }),
      expect.objectContaining({ type: 'card.stateChanged', key: 'uses', value: 2 }),
      expect.objectContaining({ type: 'card.stateChanged', key: 'uses', value: 4 }),
      expect.objectContaining({ type: 'card.stateChanged', key: 'flagged', value: true }),
    ])
  })

  it('set-flag: toggles card flag both ways', () => {
    const player = makePlayer()
    specialEffectAction.execute(
      makeCtx(player, { kind: 'set-flag', flag: true }, CARD_ID),
    )
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    specialEffectAction.execute(
      makeCtx(player, { kind: 'set-flag', flag: false }, CARD_ID),
    )
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })

  it('set-infobox: writes display text to card', () => {
    const player = makePlayer()
    specialEffectAction.execute(
      makeCtx(player, { kind: 'set-infobox', text: 'used 3x' }, CARD_ID),
    )
    expect(readCardInfobox(player, CARD_ID)).toBe('used 3x')
  })

  it('set-infobox: emits a public card infobox event', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'set-infobox', text: 'used 3x' }, CARD_ID),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.infoboxChanged',
        cardId: CARD_ID,
        text: 'used 3x',
        targetPlayerId: player.id,
      }),
    ])
  })

  it('clear-pending-fence-bonus: clears state and emits a public state event', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    storePendingFenceBonus(player, {
      sourceCard: CARD_ID,
      counterKey: 'freeFences',
      freeFences: 2,
    })

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'clear-pending-fence-bonus' }, CARD_ID),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player.cardStates.__pendingFenceBonus__?.extraData).toBeUndefined()
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.stateChanged',
        key: 'pendingFenceBonus',
        value: null,
      }),
    ])
  })

  it('consume-pending-extra-turns: no-ops silently when no opportunity is pending', () => {
    const { state, player } = setupExtraTurnPlayer({ food: 0 })
    const events: DraftGameEvent[] = []

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'consume-pending-extra-turns' }, CARD_ID, state),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player._extraTurnConsumedCount).toBeUndefined()
    expect(events).toEqual([])
  })

  it('consume-pending-extra-turns: consumes all pending opportunities and emits the source card trigger once', () => {
    const { state, player } = setupExtraTurnPlayer({ newborns: 2, food: 2 })
    const events: DraftGameEvent[] = []

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'consume-pending-extra-turns' }, CARD_ID, state),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player._extraTurnConsumedCount).toBe(2)
    expect(hasPendingExtraTurn(state, player)).toBe(false)
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.triggered',
        cardId: CARD_ID,
        sourceCardId: CARD_ID,
      }),
    ])
  })

  it('consume-pending-extra-turns: consumes only opportunities not already skipped', () => {
    const { state, player } = setupExtraTurnPlayer({ newborns: 2, food: 2 })
    const events: DraftGameEvent[] = []
    player._extraTurnSkipCount = 1

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'consume-pending-extra-turns' }, CARD_ID, state),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player._extraTurnConsumedCount).toBe(1)
    expect(hasPendingExtraTurn(state, player)).toBe(false)
    expect(events).toHaveLength(1)
  })

  it('set-counter: writes counter exactly to the provided non-negative value', () => {
    const player = makePlayer()

    const result = specialEffectAction.execute(
      makeCtx(player, { kind: 'set-counter', key: 'uses', value: 4 }, CARD_ID),
    )

    expect(result.type).toBe('ok')
    expect(player.cardStates[CARD_ID]?.counters?.uses).toBe(4)
  })

  it('set-counter: clamps negative values to 0', () => {
    const player = makePlayer()

    const result = specialEffectAction.execute(
      makeCtx(player, { kind: 'set-counter', key: 'uses', value: -2 }, CARD_ID),
    )

    expect(result.type).toBe('ok')
    expect(player.cardStates[CARD_ID]?.counters?.uses).toBe(0)
  })

  it('pop-card-stack-top: removes stack top without granting the resource', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    player.resources.wood = 1
    player.cardStates[CARD_ID] = {
      stack: ['clay', 'wood'],
    }

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'pop-card-stack-top' }, CARD_ID),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player.cardStates[CARD_ID]?.stack).toEqual(['clay'])
    expect(player.resources.wood).toBe(1)
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.stackChanged',
        cardId: CARD_ID,
        targetPlayerId: player.id,
        resources: { wood: 1 },
        delta: -1,
        reason: 'take',
      }),
    ])
  })

  it('swap-improvement-with-board: swaps player improvement with available board improvement', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    player.improvements = ['major-from', 'minor-1']
    const state = {
      players: [player],
      availableMajorImprovements: ['major-to', 'major-other'],
    } as unknown as GameState

    const result = specialEffectAction.execute({
      ...makeCtx(
        player,
        { kind: 'swap-improvement-with-board', from: 'major-from', to: 'major-to' },
        CARD_ID,
        state,
      ),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player.improvements).toEqual(['major-to', 'minor-1'])
    expect(state.availableMajorImprovements).toEqual(['major-from', 'major-other'])
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.swappedWithBoard',
        playerId: player.id,
        fromPlayerCardId: 'major-from',
        toPlayerCardId: 'major-to',
      }),
    ])
  })

  it('swap-improvement-with-board: no-ops when player already has target improvement', () => {
    const player = makePlayer()
    player.improvements = ['major-from', 'major-to', 'minor-1']
    const state = {
      players: [player],
      availableMajorImprovements: ['major-to', 'major-other'],
    } as unknown as GameState

    const result = specialEffectAction.execute(
      makeCtx(
        player,
        { kind: 'swap-improvement-with-board', from: 'major-from', to: 'major-to' },
        CARD_ID,
        state,
      ),
    )

    expect(result.type).toBe('ok')
    expect(player.improvements).toEqual(['major-from', 'major-to', 'minor-1'])
    expect(state.availableMajorImprovements).toEqual(['major-to', 'major-other'])
  })

  it('swap-improvement-with-board: removes board target without duplicating board source', () => {
    const player = makePlayer()
    player.improvements = ['major-from', 'minor-1']
    const state = {
      players: [player],
      availableMajorImprovements: ['major-to', 'major-from', 'major-other'],
    } as unknown as GameState

    const result = specialEffectAction.execute(
      makeCtx(
        player,
        { kind: 'swap-improvement-with-board', from: 'major-from', to: 'major-to' },
        CARD_ID,
        state,
      ),
    )

    expect(result.type).toBe('ok')
    expect(player.improvements).toEqual(['major-to', 'minor-1'])
    expect(state.availableMajorImprovements).toEqual(['major-from', 'major-other'])
  })

  it('swap-improvement-with-board: no-ops when player lacks from or board lacks to', () => {
    const player = makePlayer()
    player.improvements = ['major-from']
    const state = {
      players: [player],
      availableMajorImprovements: ['major-to'],
    } as unknown as GameState

    const missingPlayerCard = specialEffectAction.execute(
      makeCtx(
        player,
        { kind: 'swap-improvement-with-board', from: 'missing', to: 'major-to' },
        CARD_ID,
        state,
      ),
    )
    expect(missingPlayerCard.type).toBe('ok')
    expect(player.improvements).toEqual(['major-from'])
    expect(state.availableMajorImprovements).toEqual(['major-to'])

    const missingBoardCard = specialEffectAction.execute(
      makeCtx(
        player,
        { kind: 'swap-improvement-with-board', from: 'major-from', to: 'missing' },
        CARD_ID,
        state,
      ),
    )
    expect(missingBoardCard.type).toBe('ok')
    expect(player.improvements).toEqual(['major-from'])
    expect(state.availableMajorImprovements).toEqual(['major-to'])
  })

  it('swap-improvement-with-board: fails when state is missing', () => {
    const player = makePlayer()
    player.improvements = ['major-from']

    const result = specialEffectAction.execute({
      player,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: CARD_ID,
      params: { kind: 'swap-improvement-with-board', from: 'major-from', to: 'major-to' },
    } as ActionExecutionContext)

    expect(result.type).toBe('fail')
  })

  it('return-card-to-board: removes a played improvement and returns major cards to the board', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']
    const state = {
      players: [player],
      availableMajorImprovements: [],
    } as unknown as GameState

    const result = specialEffectAction.execute({
      ...makeCtx(
        player,
        { kind: 'return-card-to-board', cardId: 'Major_StoneOven' },
        CARD_ID,
        state,
      ),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player.improvements).toEqual(['Major_ClayOven'])
    expect(state.availableMajorImprovements).toEqual(['Major_StoneOven'])
    expect(events).toEqual([
      expect.objectContaining({
        type: 'card.returnedToBoard',
        playerId: player.id,
        cardId: 'Major_StoneOven',
      }),
    ])
  })

  it('fails when sourceCard missing', () => {
    const player = makePlayer()
    const result = specialEffectAction.execute(
      makeCtx(player, { kind: 'set-flag', flag: true }, undefined),
    )
    expect(result.type).toBe('fail')
  })

  it('fails when params missing or malformed', () => {
    const player = makePlayer()
    expect(specialEffectAction.execute(makeCtx(player, undefined, CARD_ID)).type).toBe('fail')
    expect(specialEffectAction.execute(makeCtx(player, { foo: 1 }, CARD_ID)).type).toBe('fail')
  })

  it('targetPlayerId routes mutation to specified player', () => {
    const p1 = makePlayer()
    const p2 = makePlayer()
    p2.id = 'p2'
    const state = { players: [p1, p2] } as unknown as GameState

    // Default: mutation goes to context.player (p1)
    specialEffectAction.execute({
      state,
      player: p1,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: 'foo', amount: 5 },
    })
    expect(readCardExtraData<number>(p1, CARD_ID, 'foo')).toBe(5)
    expect(readCardExtraData<number>(p2, CARD_ID, 'foo')).toBeUndefined()

    // With targetPlayerId='p2', mutation goes to p2
    specialEffectAction.execute({
      state,
      player: p1,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: 'foo', amount: 7 },
      actionContext: { targetPlayerId: 'p2' },
    })
    expect(readCardExtraData<number>(p1, CARD_ID, 'foo')).toBe(5)
    expect(readCardExtraData<number>(p2, CARD_ID, 'foo')).toBe(7)
  })

  it('targetPlayerId falls back to actor when player id not found', () => {
    const p1 = makePlayer()
    const state = { players: [p1] } as unknown as GameState
    specialEffectAction.execute({
      state,
      player: p1,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
      actionContext: { targetPlayerId: 'nonexistent' },
    })
    expect(isCardFlagged(p1, CARD_ID)).toBe(true)
  })

  describe('remove-field-crops', () => {
    it('remove-field-crop: decrements the first matching crop field and emits a crop event', () => {
      const player = makePlayer()
      const events: DraftGameEvent[] = []
      player.fields = [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      ]

      const result = specialEffectAction.execute({
        ...makeCtx(player, { kind: 'remove-field-crop', crop: 'grain' }, CARD_ID),
        eventSink: makeEventSink(events),
      })

      expect(result.type).toBe('ok')
      expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
      expect(player.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
      expect(events).toEqual([
        expect.objectContaining({
          type: 'farm.cropRemoved',
          reason: 'cardEffect',
          crops: [
            { location: { kind: 'field', playerId: player.id, row: 0, col: 1 }, crop: 'grain', amount: 1 },
          ],
        }),
      ])
    })

    it('decrements two selected crop fields', () => {
      const player = makePlayer()
      const events: DraftGameEvent[] = []
      player.fields = [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 1, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ]

      const result = specialEffectAction.execute({
        ...makeCtx(
          player,
          {
            kind: 'remove-field-crops',
            crop: 'grain',
            positions: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
          },
          CARD_ID,
        ),
        eventSink: makeEventSink(events),
      })

      expect(result.type).toBe('ok')
      expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
      expect(player.fields[1]!.stacks).toEqual([])
      expect(player.fields[2]!.stacks).toEqual([{ kind: 'vegetable', remaining: 2 }])
      expect(events).toEqual([
        expect.objectContaining({
          type: 'farm.cropRemoved',
          reason: 'cardEffect',
          crops: [
            { location: { kind: 'field', playerId: player.id, row: 0, col: 0 }, crop: 'grain', amount: 1 },
            { location: { kind: 'field', playerId: player.id, row: 0, col: 1 }, crop: 'grain', amount: 1 },
          ],
        }),
      ])
    })

    it('fails atomically when any selected field is not a valid source', () => {
      const player = makePlayer()
      player.fields = [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        {
          row: 0,
          col: 1,
          stacks: [
            { kind: 'grain', remaining: 3 },
            { kind: 'vegetable', remaining: 2 },
          ],
        },
      ]

      const result = specialEffectAction.execute(
        makeCtx(
          player,
          {
            kind: 'remove-field-crops',
            crop: 'grain',
            positions: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
            ],
          },
          CARD_ID,
        ),
      )

      expect(result).toEqual({ type: 'fail', errorKey: 'log.specialEffectFail' })
      expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
      expect(player.fields[1]!.stacks).toEqual([
        { kind: 'grain', remaining: 3 },
        { kind: 'vegetable', remaining: 2 },
      ])
    })

    it('fails atomically when positions include a duplicate coordinate', () => {
      const player = makePlayer()
      player.fields = [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      ]

      const result = specialEffectAction.execute(
        makeCtx(
          player,
          {
            kind: 'remove-field-crops',
            crop: 'grain',
            positions: [
              { row: 0, col: 0 },
              { row: 0, col: 0 },
            ],
          },
          CARD_ID,
        ),
      )

      expect(result).toEqual({ type: 'fail', errorKey: 'log.specialEffectFail' })
      expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
      expect(player.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    })

    it('fails atomically when positions include null or malformed entries', () => {
      for (const invalidPosition of [null, { row: 0 }]) {
        const player = makePlayer()
        player.fields = [
          { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
          { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
        ]

        const result = specialEffectAction.execute(
          makeCtx(
            player,
            {
              kind: 'remove-field-crops',
              crop: 'grain',
              positions: [invalidPosition, { row: 0, col: 1 }],
            },
            CARD_ID,
          ),
        )

        expect(result).toEqual({ type: 'fail', errorKey: 'log.specialEffectFail' })
        expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
        expect(player.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
      }
    })
  })

  it('failed special-effect emits no events', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []

    const result = specialEffectAction.execute({
      ...makeCtx(player, { kind: 'consume-fence', count: 1 }, CARD_ID),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('fail')
    expect(events).toEqual([])
  })

  describe('consume-fence', () => {
    it('removes only own ordinary fences when sourcePolicy is ownOnly', () => {
      const player = makePlayer()
      player.fenceSegments = [
        { edge: 'H-0-0', type: 'fence' },
        { edge: 'H-0-1', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
        { edge: 'H-0-2', type: 'palisade', source: { kind: 'own', ownerPlayerId: player.id } },
        { edge: 'H-0-3', type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } },
      ]

      const result = specialEffectAction.execute(
        makeCtx(
          player,
          { kind: 'consume-fence', count: 2, segmentType: 'fence', sourcePolicy: 'ownOnly' },
          CARD_ID,
        ),
      )

      expect(result.type).toBe('ok')
      expect(player.fenceSegments).toEqual([
        { edge: 'H-0-1', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
        { edge: 'H-0-2', type: 'palisade', source: { kind: 'own', ownerPlayerId: player.id } },
      ])
    })

    it('fails atomically when ownOnly has fewer matching own ordinary fences than requested', () => {
      const player = makePlayer()
      player.fenceSegments = [
        { edge: 'H-0-0', type: 'fence' },
        { edge: 'H-0-1', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
        { edge: 'H-0-2', type: 'palisade', source: { kind: 'own', ownerPlayerId: player.id } },
      ]
      const before = structuredClone(player.fenceSegments)

      const result = specialEffectAction.execute(
        makeCtx(
          player,
          { kind: 'consume-fence', count: 2, segmentType: 'fence', sourcePolicy: 'ownOnly' },
          CARD_ID,
        ),
      )

      expect(result).toEqual({ type: 'fail', errorKey: 'log.specialEffectFail' })
      expect(player.fenceSegments).toEqual(before)
    })

    it('uses the target player id for ownOnly filtering when targetPlayerId routes the mutation', () => {
      const p1 = makePlayer()
      const p2 = makePlayer()
      p2.id = 'p2'
      p2.name = 'P2'
      p2.fenceSegments = [
        { edge: 'H-0-0', type: 'fence', source: { kind: 'own', ownerPlayerId: p2.id } },
        { edge: 'H-0-1', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: p1.id } },
        { edge: 'H-0-2', type: 'fence', source: { kind: 'own', ownerPlayerId: p1.id } },
      ]
      const state = { players: [p1, p2] } as unknown as GameState

      const result = specialEffectAction.execute({
        ...makeCtx(
          p1,
          { kind: 'consume-fence', count: 1, segmentType: 'fence', sourcePolicy: 'ownOnly' },
          CARD_ID,
          state,
        ),
        actionContext: { targetPlayerId: p2.id },
      })

      expect(result.type).toBe('ok')
      expect(p2.fenceSegments).toEqual([
        { edge: 'H-0-1', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: p1.id } },
        { edge: 'H-0-2', type: 'fence', source: { kind: 'own', ownerPlayerId: p1.id } },
      ])
    })
  })

  // E166 Roastmaster relies on this SE kind. The plan (Task 9, F9) calls out
  // BGA's "actually move the food meeple" semantic — verify the source space
  // truly decrements and the destination truly increments.
  describe('move-resource-between-spaces (E166 BGA parity)', () => {
    const makeSpace = (id: string, food: number): ActionSpace => ({
      id,
      nameKey: `actions.${id}.name`,
      descriptionKey: `actions.${id}.description`,
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      } as Resource,
      takenBy: [],
    } as ActionSpace)

    it('decrements source by amount and increments destination by the same amount', () => {
      const p1 = makePlayer()
      const events: DraftGameEvent[] = []
      const fishing = makeSpace('fishing', 3)
      const tp = makeSpace('traveling-players', 1)
      const state = { actionSpaces: [fishing, tp], players: [p1] } as unknown as GameState

      const result = specialEffectAction.execute({
        state,
        player: p1,
        space: { id: 'special-effect' } as ActionSpace,
        sourceCard: 'E166_Roastmaster',
        params: {
          kind: 'move-resource-between-spaces',
          fromSpaceId: 'fishing',
          toSpaceId: 'traveling-players',
          resource: 'food',
          amount: 1,
        },
        eventSink: makeEventSink(events),
      })

      expect(result.type).toBe('ok')
      expect(fishing.resources.food).toBe(2)
      expect(tp.resources.food).toBe(2)
      // Player resources unchanged: this is a meeple-move, not a gain.
      expect(p1.resources.food).toBe(0)
      expect(events).toEqual([
        expect.objectContaining({
          type: 'resource.moved',
          resources: { food: 1 },
          from: { kind: 'actionSpace', spaceId: 'fishing' },
          to: { kind: 'actionSpace', spaceId: 'traveling-players' },
          reason: 'cardEffect',
        }),
      ])
    })

    it('fails when source has fewer than amount and leaves both spaces untouched', () => {
      const p1 = makePlayer()
      const fishing = makeSpace('fishing', 0)
      const tp = makeSpace('traveling-players', 5)
      const state = { actionSpaces: [fishing, tp], players: [p1] } as unknown as GameState

      const result = specialEffectAction.execute({
        state,
        player: p1,
        space: { id: 'special-effect' } as ActionSpace,
        sourceCard: 'E166_Roastmaster',
        params: {
          kind: 'move-resource-between-spaces',
          fromSpaceId: 'fishing',
          toSpaceId: 'traveling-players',
          resource: 'food',
          amount: 1,
        },
      })

      expect(result.type).toBe('fail')
      expect(fishing.resources.food).toBe(0)
      expect(tp.resources.food).toBe(5)
    })
  })

  it('emits public events for future meeple removal, newborn promotion, fence use, stable build, and action accumulation', () => {
    const player = makePlayer()
    player.workers = [
      { id: '1', isActive: true, isNewborn: true },
      { id: '2', isActive: true, isNewborn: false },
    ]
    player.fenceSegments = [{ edge: '0-0:N', type: 'fence' }]
    const state = {
      players: [player],
      actionSpaces: [
        {
          id: 'forest',
          resources: {
            wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
            vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
          },
          takenBy: [],
        },
      ],
      futureMeeples: [
        { id: 'f1', playerId: player.id, cardId: CARD_ID, round: 3, actionId: null, resources: { food: 1 } },
      ],
    } as unknown as GameState
    const events: DraftGameEvent[] = []
    const eventSink = makeEventSink(events)

    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'remove-future-meeples', rounds: [3] }, CARD_ID, state),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'promote-first-newborn' }, CARD_ID, state),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'consume-fence', count: 1 }, CARD_ID, state),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'add-resource-to-space', spaceId: 'forest', resource: 'wood', amount: 2 }, CARD_ID, state),
      eventSink,
    })
    specialEffectAction.execute({
      ...makeCtx(player, { kind: 'build-stable-on-first-empty-tile' }, CARD_ID, state),
      eventSink,
    })

    expect(events).toEqual([
      expect.objectContaining({ type: 'futureMeeple.removed', playerId: player.id, cardId: CARD_ID, rounds: [3] }),
      expect.objectContaining({ type: 'worker.promoted', playerId: player.id, workerId: '1', from: 'newborn', to: 'adult' }),
      expect.objectContaining({ type: 'farm.fenceConsumed', count: 1, reason: 'cardEffect' }),
      expect.objectContaining({ type: 'action.accumulated', spaceId: 'forest', resources: { wood: 2 } }),
      expect.objectContaining({ type: 'farm.stableBuilt', stables: [expect.objectContaining({ playerId: player.id })] }),
    ])
  })

  it('add-resource-to-space: emits resource accumulation for card and round-card targets', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    const eventSink = makeEventSink(events)
    const state = {
      players: [player],
      actionSpaces: [],
    } as unknown as GameState

    let result = specialEffectAction.execute({
      ...makeCtx(
        player,
        { kind: 'add-resource-to-space', target: { kind: 'card', cardId: 'D75_WoodField' }, resource: 'wood', amount: 2 },
        CARD_ID,
        state,
      ),
      eventSink,
    })
    expect(result.type).toBe('ok')
    result = specialEffectAction.execute({
      ...makeCtx(
        player,
        { kind: 'add-resource-to-space', target: { kind: 'roundCard', round: 5 }, resource: 'food', amount: 1 },
        CARD_ID,
        state,
      ),
      eventSink,
    })

    expect(result.type).toBe('ok')
    expect(player.cardStates.D75_WoodField?.counters?.wood).toBe(2)
    expect(events).toEqual([
      expect.objectContaining({
        type: 'resource.accumulated',
        resources: { wood: 2 },
        to: { kind: 'card', playerId: player.id, cardId: 'D75_WoodField' },
      }),
      expect.objectContaining({
        type: 'resource.accumulated',
        resources: { food: 1 },
        to: { kind: 'roundCard', round: 5 },
      }),
    ])
  })

  it('plant-additional-good: adds crops to field and card-backed fields and emits crop-added', () => {
    const player = makePlayer()
    const events: DraftGameEvent[] = []
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    player.cardStates.D75_WoodField = {
      extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
    }

    const result = specialEffectAction.execute({
      ...makeCtx(
        player,
        {
          kind: 'plant-additional-good',
          locations: [
            { kind: 'field', row: 0, col: 0 },
            { kind: 'card-field', cardId: 'D75_WoodField' },
          ],
        },
        CARD_ID,
      ),
      eventSink: makeEventSink(events),
    })

    expect(result.type).toBe('ok')
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(player.cardStates.D75_WoodField?.extraData?.cardFieldStacks).toEqual([{ crop: 'wood', remaining: 2 }])
    expect(events).toEqual([
      expect.objectContaining({
        type: 'farm.cropAdded',
        reason: 'cardEffect',
        crops: [
          { location: { kind: 'field', playerId: player.id, row: 0, col: 0 }, crop: 'grain', amount: 1 },
          { location: { kind: 'card', playerId: player.id, cardId: 'D75_WoodField' }, crop: 'wood', amount: 1 },
        ],
      }),
    ])
  })
})
