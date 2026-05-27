import { describe, expect, it } from 'vitest'
import {
  buildCardListenerContext,
  executeCardListener,
  getMatchingListeners,
  runCardListeners,
  type CardListenerRegistration,
} from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
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
  },
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  cardStates: {},
  ...overrides,
} as PlayerState)

const makeState = (players: PlayerState[]): GameState => ({
  players,
  actionSpaces: [],
} as unknown as GameState)

const makeSpace = (): ActionSpace => ({ id: 'test', resources: {} } as ActionSpace)

describe('card listener zones', () => {
  it('keeps listeners played-only by default', () => {
    const player = makePlayer({ minorHand: ['X_TestCard'] })
    const context = {
      state: makeState([player]),
      player,
      space: makeSpace(),
      actionId: 'test-action',
      phase: 'after' as const,
    }
    const listener: CardListenerRegistration = {
      id: 'test-played-only',
      cardIds: ['X_TestCard'],
      handler: () => ({ extraData: { seen: true } }),
    }

    expect(getMatchingListeners(context, [listener])).toEqual([])
    expect(runCardListeners(context, [listener])).toEqual([])

    player.minorHand = []
    player.minorPlayed = ['X_TestCard']

    expect(getMatchingListeners(context, [listener])).toMatchObject([
      { cardId: 'X_TestCard', ownerPlayerId: 'p1', ownerCardZone: 'played' },
    ])
  })

  it('keeps opponent and any scope listeners played-only by default', () => {
    const player = makePlayer({ id: 'p1' })
    const opponent = makePlayer({ id: 'p2', minorHand: ['X_TestCard'] })
    const context = {
      state: makeState([player, opponent]),
      player,
      space: makeSpace(),
      actionId: 'test-action',
      phase: 'after' as const,
    }
    const opponentListener: CardListenerRegistration = {
      id: 'test-opponent-played-only',
      cardIds: ['X_TestCard'],
      scope: 'opponent',
      handler: () => ({ extraData: { seen: true } }),
    }
    const anyListener: CardListenerRegistration = {
      id: 'test-any-played-only',
      cardIds: ['X_TestCard'],
      scope: 'any',
      handler: () => ({ extraData: { seen: true } }),
    }

    expect(getMatchingListeners(context, [opponentListener])).toEqual([])
    expect(getMatchingListeners(context, [anyListener])).toEqual([])

    opponent.minorHand = []
    opponent.minorPlayed = ['X_TestCard']

    expect(getMatchingListeners(context, [opponentListener])).toMatchObject([
      { cardId: 'X_TestCard', ownerPlayerId: 'p2', ownerCardZone: 'played' },
    ])
    expect(getMatchingListeners(context, [anyListener])).toMatchObject([
      { cardId: 'X_TestCard', ownerPlayerId: 'p2', ownerCardZone: 'played' },
    ])
  })

  it('matches hand listeners only when zones includes hand', () => {
    const player = makePlayer({ minorHand: ['X_TestCard'] })
    const context = {
      state: makeState([player]),
      player,
      space: makeSpace(),
      actionId: 'test-action',
      phase: 'after' as const,
    }
    const listener: CardListenerRegistration = {
      id: 'test-hand',
      cardIds: ['X_TestCard'],
      zones: ['hand'],
      handler: (ctx) => ({
        extraData: {
          ownerCardId: ctx.ownerCardId,
          ownerCardZone: ctx.ownerCardZone,
          ownerPlayerId: ctx.ownerPlayer?.id,
        },
      }),
    }

    const matched = getMatchingListeners(context, [listener])
    expect(matched).toMatchObject([
      { cardId: 'X_TestCard', ownerPlayerId: 'p1', ownerCardZone: 'hand' },
    ])
    expect(runCardListeners(context, [listener])[0]?.extraData).toEqual({
      ownerCardId: 'X_TestCard',
      ownerCardZone: 'hand',
      ownerPlayerId: 'p1',
    })
  })

  it('passes ownerCardZone through executeCardListener', () => {
    const player = makePlayer({ minorPlayed: ['X_TestCard'] })
    const context = {
      state: makeState([player]),
      player,
      space: makeSpace(),
      actionId: 'test-action',
      phase: 'after' as const,
    }
    const listener: CardListenerRegistration = {
      id: 'test-played',
      cardIds: ['X_TestCard'],
      handler: (ctx) => ({
        extraData: { ownerCardId: ctx.ownerCardId, ownerCardZone: ctx.ownerCardZone },
      }),
    }

    const built = buildCardListenerContext(listener, context, {
      ownerPlayerId: 'p1',
      ownerCardId: 'X_TestCard',
      ownerCardZone: 'played',
    })
    const result = executeCardListener(listener, context, {
      ownerPlayerId: 'p1',
      ownerCardId: 'X_TestCard',
      ownerCardZone: 'played',
    })

    expect(built.ownerCardId).toBe('X_TestCard')
    expect(built.ownerCardZone).toBe('played')
    expect(result?.extraData).toEqual({
      ownerCardId: 'X_TestCard',
      ownerCardZone: 'played',
    })
  })
})
