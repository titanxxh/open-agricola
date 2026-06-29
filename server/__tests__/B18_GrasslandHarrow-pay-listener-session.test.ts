import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { futureMeeplesAction } from '../../shared/actions/effects/internal/future-meeples'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/B/B018_GrasslandHarrow'

const CARD_ID = 'B018_GrasslandHarrow'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (round: number, ...players: PlayerState[]): GameState =>
  ({
    round, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

const executeDeterministicLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
  space: ActionSpace = createSpace('test'),
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeDeterministicLeaves(child, state, player, space))
    return
  }
  if (flow.type !== 'leaf') return
  if (flow.actionId === 'special-effect') {
    specialEffectAction.execute({
      state,
      player,
      space,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
    })
  }
  if (flow.actionId === 'future-meeples') {
    futureMeeplesAction.execute({
      state,
      player,
      space,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
    })
  }
}

describe('B18 GrasslandHarrow — after-pay listener', () => {
  it('listener registered with actions:[pay] and after phase', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['pay'])
    expect(listener!.phases).toEqual(['after'])
    // Purchase payment fires before B18 enters minorPlayed, so this listener
    // must be sourceCard-gated rather than cardIds-gated.
    expect(listener!.cardIds).toBeUndefined()
  })

  it('reserve 0: silent return (no future meeple queued)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    // Post-pay: zero building resources left in supply
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: { wood: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('reserve = sum(wood/clay/stone/reed): queues future meeple at current+reserve', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    // After paying: supply has 1 of each building resource → reserve = 4
    player.resources = { ...player.resources, wood: 1, clay: 1, stone: 1, reed: 1 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: { wood: 2 } },
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
    expect(result!.flow).toMatchObject({
      type: 'leaf',
      actionId: 'future-meeples',
      params: { __futureMeepleRequest: { cardId: CARD_ID, playerId: 'p1' } },
    })
    executeDeterministicLeaves(result!.flow, state, player)
    expect(state.futureMeeples.length).toBe(1)
    const entry = state.futureMeeples[0]!
    expect(entry.round).toBe(7)
    expect(entry.cardId).toBe(CARD_ID)
    expect(entry.playerId).toBe('p1')
    expect(entry.resources).toEqual({ field: 1 })
    const req = (result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params!.__futureMeepleRequest
    if (req && typeof req === 'object' && 'entries' in req) {
      // current round 3 + reserve 4 = round 7
      expect(req.entries.map((e) => e.round)).toEqual([7])
      expect(req.entries.map((e) => e.resources)).toEqual([{ field: 1 }])
      expect(req.cardId).toBe(CARD_ID)
      expect(req.playerId).toBe('p1')
    } else {
      throw new Error('expected entries-shaped future request')
    }
  })

  it('clamps target round to 14', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 5, clay: 5, stone: 5, reed: 5 }
    const state = createState(12, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: {} },
    } as unknown as CardListenerContext)
    expect(result?.flow).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    const req = flow.params!.__futureMeepleRequest
    if (req && typeof req === 'object' && 'entries' in req) {
      expect(req.entries[0]!.round).toBe(14)
    } else {
      throw new Error('expected entries-shaped future request')
    }
  })

  it('no trigger when sourceCard is another card (B18 only fires on its own pay)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: 'OtherCard',
      result: { type: 'ok', resourcesPaid: { wood: 1 } },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('no trigger when result is not ok (pay cancelled / failed)', () => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const result = executeCardListener(listener, {
      state, player, space: createSpace('improvement'),
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'fail', errorKey: 'log.payFail' },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onBuy no longer emits future meeples (migrated to listener)', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const player = createPlayer()
    player.resources = { ...player.resources, wood: 2, clay: 2, stone: 2, reed: 2 }
    const state = createState(3, player)
    const flow = effect!.onBuy?.(state, player)
    expect(flow).toBeUndefined()
    // onBuy must NOT queue any future meeple now — listener owns that.
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('real purchase path queues future field before B18 is in minorPlayed', () => {
    const session = new GameSession(1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3
    state.roundPhase = 'work'

    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationPlayed = ['__test_occ_1__', '__test_occ_2__']
    player.resources = {
      ...player.resources,
      wood: 3,
      clay: 1,
      reed: 0,
      stone: 0,
      food: 0,
    }
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
    if (improvementOption) {
      resp = session.resolveChoice(0, improvementOption.value)
      expect(resp.ok).toBe(true)
    }
    if (resp.interaction.sourceCard !== CARD_ID) {
      if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) {
        expect(resp.ok).toBe(true)
      } else {
        expect(resp.interaction.stateId).toBe('wait')
        if (resp.interaction.stateId !== 'wait') return
        const cardOption = resp.interaction.options?.find((option) => option.value === CARD_ID)
        expect(cardOption).toBeDefined()
        resp = session.resolveChoice(0, cardOption!.value)
      }
    }
    expect(resp.ok).toBe(true)
    const p0 = resp.state.players[0]!
    expect(p0.minorPlayed).toContain(CARD_ID)
    expect(resp.state.futureMeeples).toEqual([
      expect.objectContaining({
        cardId: CARD_ID,
        playerId: p0.id,
        round: 5,
        resources: { field: 1 },
      }),
    ])
  })
})
