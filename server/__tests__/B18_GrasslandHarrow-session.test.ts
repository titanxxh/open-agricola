import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { futureMeeplesAction } from '../../shared/actions/effects/internal/future-meeples'

import '../../shared/cards/B/B18_GrasslandHarrow'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../shared/contract/types'

const CARD_ID = 'B18_GrasslandHarrow'

const findListener = (id: string) => getRegisteredCardListeners().find((l) => l.id === id)

describe('B18_GrasslandHarrow onRoundStart (post 7b1 listener migration)', () => {
  const setupState = (round: number, resources: Partial<Record<string, number>>) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = round

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      ...resources,
    } as typeof player.resources

    session.loadState(state)
    return { session, state, player }
  }

  const executeDeterministicLeaves = (
    flow: ActionFlow | undefined,
    state: GameState,
    player: PlayerState,
    space: ActionSpace = { id: 'test' } as ActionSpace,
  ) => {
    if (!flow) return
    if (flow.type === 'seq') {
      flow.children.forEach((child) => executeDeterministicLeaves(child, state, player, space))
      return
    }
    if (flow.type !== 'leaf') return
    if (flow.actionId === 'special-effect') {
      specialEffectAction.execute({ state, player, space, params: flow.params, sourceCard: flow.sourceCard, actionContext: flow.actionContext })
    }
    if (flow.actionId === 'future-meeples') {
      futureMeeplesAction.execute({ state, player, space, params: flow.params, sourceCard: flow.sourceCard, actionContext: flow.actionContext })
    }
  }

  const fireAfterPay = (state: ReturnType<typeof setupState>['state'], player: ReturnType<typeof setupState>['player']) => {
    const listener = findListener('B18-grassland-harrow-after-pay')!
    const result = executeCardListener(listener, {
      state, player,
      space: { id: 'improvement' } as never,
      actionId: 'pay', phase: 'after',
      sourceCard: CARD_ID,
      result: { type: 'ok', resourcesPaid: { wood: 2 } },
    } as unknown as CardListenerContext)
    executeDeterministicLeaves(result?.flow, state, player)
    return result
  }

  it('after-pay listener queues field at current round + reserve', () => {
    const { state, player } = setupState(3, {
      wood: 2, stone: 1, clay: 1, reed: 0, food: 0,
    })
    const result = fireAfterPay(state, player)
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', params: { kind: 'set-extra-data', key: 'targetRound', value: 7 } },
        { type: 'leaf', actionId: 'future-meeples' },
      ],
    })
    expect(state.futureMeeples.map((entry) => entry.round)).toEqual([7])
  })

  it('onBuy is now a no-op (listener drives the future meeple)', () => {
    const { state, player } = setupState(3, {
      wood: 2, stone: 1, clay: 1, reed: 0, food: 0,
    })
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('onRoundStart offers optional plow at the target round (driven by listener-set targetRound)', () => {
    const { state, player } = setupState(3, {
      wood: 1, stone: 1, clay: 0, reed: 0, food: 0,
    })
    player.minorPlayed.push(CARD_ID)
    fireAfterPay(state, player)
    // target round = 3 + 2 = 5
    state.round = 5
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).optional).toBe(true)
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0]!.actionId).toBe('plow')
  })

  it('onRoundStart returns nothing when it is not the target round', () => {
    const { state, player } = setupState(3, {
      wood: 1, stone: 0, clay: 0, reed: 0,
    })
    player.minorPlayed.push(CARD_ID)
    fireAfterPay(state, player)
    state.round = 6
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

})
