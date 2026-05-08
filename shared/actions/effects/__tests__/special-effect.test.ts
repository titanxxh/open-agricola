import { describe, it, expect } from 'vitest'
import { specialEffectAction } from '../special-effect'
import {
  readCardExtraData,
  readCardInfobox,
  isCardFlagged,
} from '../../../cards/helpers/card-state'
import type { ActionExecutionContext, PlayerState, Resource, GameState, ActionSpace } from '../../../contract/types'

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

const makeCtx = (player: PlayerState, params: unknown, sourceCard?: string): ActionExecutionContext => ({
  state: {} as GameState,
  player,
  space: { id: 'special-effect' } as ActionSpace,
  sourceCard,
  params: params as Record<string, unknown>,
})

const CARD_ID = 'TEST_CARD'

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
      })

      expect(result.type).toBe('ok')
      expect(fishing.resources.food).toBe(2)
      expect(tp.resources.food).toBe(2)
      // Player resources unchanged: this is a meeple-move, not a gain.
      expect(p1.resources.food).toBe(0)
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
})
