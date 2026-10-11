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
  it.each(['after', 'immediatelyAfter'] as const)('excludes the newly played card from its own %s listeners', (phase) => {
    const player = makePlayer({ occupationPlayed: ['X_TestCard', 'X_OldCard'] })
    const context = { state: makeState([player]), player, space: makeSpace(), actionId: 'occupation',
      phase, choice: 'X_TestCard' }
    const listener: CardListenerRegistration = { id: 'self-play', cardIds: ['X_TestCard', 'X_OldCard'] }
    expect(getMatchingListeners(context, [listener])).toMatchObject([{ cardId: 'X_OldCard' }])
  })

  it.each(['X_TestCard', 'minor:X_TestCard', 'major:X_TestCard'])('normalizes improvement choice %s for self exclusion', (choice) => {
    const player = makePlayer({ minorPlayed: ['X_TestCard'] })
    const context = { state: makeState([player]), player, space: makeSpace(), actionId: 'improvement',
      phase: 'after' as const, choice }
    expect(getMatchingListeners(context, [{ id: 'self-play', cardIds: ['X_TestCard'] }])).toEqual([])
  })

  it('keeps opponent and any owners eligible when the acting player just played the same card id', () => {
    const player = makePlayer({ minorPlayed: ['X_TestCard'] })
    const opponent = makePlayer({ id: 'p2', minorPlayed: ['X_TestCard'] })
    const context = { state: makeState([player, opponent]), player, space: makeSpace(), actionId: 'improvement',
      phase: 'after' as const, choice: 'X_TestCard' }
    for (const scope of ['opponent', 'any'] as const) {
      expect(getMatchingListeners(context, [{ id: `self-${scope}`, cardIds: ['X_TestCard'], scope }]))
        .toMatchObject([{ cardId: 'X_TestCard', ownerPlayerId: 'p2' }])
    }
  })

  it('preserves hand listeners, global listeners, before phases, and enclosing placement reactions', () => {
    const player = makePlayer({ minorHand: ['X_TestCard'], minorPlayed: ['X_OldCard'] })
    const context = { state: makeState([player]), player, space: makeSpace(), actionId: 'improvement',
      phase: 'after' as const, choice: 'X_TestCard' }
    expect(getMatchingListeners(context, [{ id: 'hand', cardIds: ['X_TestCard'], zones: ['hand'] }]))
      .toMatchObject([{ ownerCardZone: 'hand' }])
    expect(getMatchingListeners(context, [{ id: 'global' }])).toHaveLength(1)
    player.minorPlayed.push('X_TestCard')
    expect(getMatchingListeners({ ...context, phase: 'before' }, [{ id: 'before', cardIds: ['X_TestCard'] }])).toHaveLength(1)
    expect(getMatchingListeners({ ...context, actionId: 'place-farmer' }, [{ id: 'outer', cardIds: ['X_TestCard'] }])).toHaveLength(1)
  })

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

  it('excludes listeners owned by a player skipping the current harvest', () => {
    const player = makePlayer({ id: 'p1' })
    const opponent = makePlayer({
      id: 'p2',
      minorPlayed: ['X_TestCard'],
      cardStates: { X_TestCard: { extraData: { skipHarvestRound: 4 } } },
    })
    const state = makeState([player, opponent])
    state.round = 4
    state.roundPhase = 'harvest'
    const context = {
      state,
      player,
      space: makeSpace(),
      actionId: 'test-action',
      phase: 'after' as const,
    }
    const listener: CardListenerRegistration = {
      id: 'test-skipped-harvest-owner',
      cardIds: ['X_TestCard'],
      scope: 'opponent',
    }

    expect(getMatchingListeners(context, [listener])).toEqual([])

    state.roundPhase = 'preparation'
    expect(getMatchingListeners(context, [listener])).toMatchObject([
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
