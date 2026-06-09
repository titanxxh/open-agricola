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

describe('B18_GrasslandHarrow after-pay future field', () => {
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
      type: 'leaf',
      actionId: 'future-meeples',
    })
    expect(state.futureMeeples.map((entry) => entry.round)).toEqual([7])
    expect(state.futureMeeples.map((entry) => entry.resources)).toEqual([{ field: 1 }])
  })

  it('does not expose an onBuy flow', () => {
    const { state } = setupState(3, {
      wood: 2, stone: 1, clay: 1, reed: 0, food: 0,
    })
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.onBuy).toBeUndefined()
    expect(state.pendingFutureMeeples.length).toBe(0)
  })

  it('does not expose a card-local onRoundStart flow', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect!.onRoundStart).toBeUndefined()
  })

})
