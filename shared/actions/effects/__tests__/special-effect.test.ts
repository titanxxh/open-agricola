import { describe, it, expect } from 'vitest'
import { specialEffectAction } from '../special-effect'
import {
  readCardExtraData,
  readCardInfobox,
  isCardFlagged,
} from '../../../cards/helpers/card-state'
import type { ActionExecutionContext, PlayerState, Resource, GameState, ActionSpace } from '../../../game/types'

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
})
