import { describe, it, expect } from 'vitest'
import { executeCardListener, getRegisteredCardListeners, runCardListeners } from '../card-listeners'
import { readCardExtraData, readCardInfobox } from '../helpers/card-state'
import { specialEffectAction } from '../../actions/effects/special-effect'
import type { ActionFlow, GameState, PlayerState, ActionSpace } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import type { CardListenerContext } from '../card-listeners'
import { D36_BreedRegistry_impl } from '../D/D36_BreedRegistry'

import '../D/D36_BreedRegistry'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {},
    minorPlayed: ['D36_BreedRegistry'],
  } as unknown as PlayerState)

const createState = (player: PlayerState): GameState =>
  ({ players: [player], log: [] } as unknown as GameState)

const createSpace = (id: string): ActionSpace =>
  ({ id, resources: {} } as unknown as ActionSpace)

const sheepMoved = (sheep: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const sheepMovedFromCard = (sheep: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep },
  from: { kind: 'card', playerId: 'p1', cardId: 'X_SheepCard' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
  sourceCardId: 'X_SheepCard',
})

const futureSheepResolved = (sheep: number): DraftGameEvent<'futureMeeple.resolved'> => ({
  type: 'futureMeeple.resolved',
  playerId: 'p1',
  cardId: 'X_FutureSheep',
  sourceCardId: 'X_FutureSheep',
  round: 3,
  resources: { sheep },
})

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)!

const executeSpecialEffectLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
  space: ActionSpace = createSpace('test'),
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(child, state, player, space))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  specialEffectAction.execute({
    state,
    player,
    space,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  })
}

describe('D36_BreedRegistry infobox', () => {
  it('tracks hand sheep gains without writing an infobox', () => {
    const listener = findListener('D36-breed-registry-after-sheep-gain')
    const player = createPlayer()
    player.minorPlayed = []
    player.minorHand = ['D36_BreedRegistry']

    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      ownerPlayer: player,
      ownerCardZone: 'hand',
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [sheepMoved(1)],
      actionEvents: [sheepMoved(1)],
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardExtraData<number>(player, 'D36_BreedRegistry', 'boardSheep')).toBe(1)
    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBeUndefined()
  })

  it('tracks sheep gained by another player for the owner in hand', () => {
    const actor = createPlayer('p1')
    const owner = createPlayer('p2')
    actor.minorPlayed = []
    owner.minorPlayed = []
    owner.minorHand = ['D36_BreedRegistry']
    const state = { players: [actor, owner], log: [] } as unknown as GameState
    const actionEvents: DraftGameEvent<'resource.moved'>[] = [{
      ...sheepMoved(1),
      from: { kind: 'card', playerId: 'p1', cardId: 'X_Giver' },
      to: { kind: 'player', playerId: 'p2' },
      reason: 'cardEffect',
    }]

    const [result] = runCardListeners({
      state,
      player: actor,
      space: createSpace('gift-sheep'),
      actionId: 'gain',
      phase: 'after',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext, D36_BreedRegistry_impl.listeners)
    executeSpecialEffectLeaves(result?.flow, state, actor)

    expect(readCardExtraData<number>(owner, 'D36_BreedRegistry', 'cardSheep')).toBe(1)
    expect(readCardInfobox(owner, 'D36_BreedRegistry')).toBeUndefined()
  })

  it('writes infobox "n / 2" after played-card sheep gains', () => {
    const listener = findListener('D36-breed-registry-after-sheep-gain')
    const player = createPlayer()

    let state = createState(player)
    let result = executeCardListener(listener, {
      state,
      player,
      ownerPlayer: player,
      ownerCardZone: 'played',
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [sheepMoved(1)],
      actionEvents: [sheepMoved(1)],
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('1 / 2')

    state = createState(player)
    result = executeCardListener(listener, {
      state,
      player,
      ownerPlayer: player,
      ownerCardZone: 'played',
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [sheepMoved(2)],
      actionEvents: [sheepMoved(2)],
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('3 / 2')
  })

  it('tracks sheep taken from card stacks through the listener action filter', () => {
    const player = createPlayer()
    const state = createState(player)
    const actionEvents = [sheepMovedFromCard(1)]

    const [result] = runCardListeners({
      state,
      player,
      space: createSpace('take-from-card'),
      actionId: 'take-from-card',
      phase: 'after',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext, D36_BreedRegistry_impl.listeners)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardExtraData<number>(player, 'D36_BreedRegistry', 'cardSheep')).toBe(1)
    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('1 / 2')
  })

  it('tracks future meeple sheep through immediatelyAfter synthetic dispatch', () => {
    const player = createPlayer()
    player.minorPlayed = []
    player.minorHand = ['D36_BreedRegistry']
    const state = createState(player)
    const actionEvents = [futureSheepResolved(1)]

    const [result] = runCardListeners({
      state,
      player,
      space: createSpace('future-meeple-resolved'),
      actionId: 'future-meeple-resolved',
      phase: 'immediatelyAfter',
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext, D36_BreedRegistry_impl.listeners)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardExtraData<number>(player, 'D36_BreedRegistry', 'cardSheep')).toBe(1)
    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBeUndefined()
  })
})
