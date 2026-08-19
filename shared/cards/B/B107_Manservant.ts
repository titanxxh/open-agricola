import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B107_Manservant'
/**
 * B107 Manservant
 * Once you live in a stone house, place 3 food on each remaining round space.
 * At the start of these rounds, you get the food.
 *
 * Rule: onBuy delegates to onPlayerAfterRenovation.
 * Only triggers when player is in a stone house.
 * Uses futureMeeplesNode with count = 14 (all remaining rounds).
 */

const placeFood = (
  state: GameState,
  player: PlayerState,
) => {
  if (player.houseType !== 'stone') return

  queueFutureMeeples(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 14,
    resources: { food: 3 },
  })
  return futureMeeplesNode()
}

const listener: CardListenerRegistration = {
  id: 'B107-manservant-after-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only triggers when renovating to stone
    if (context.player.houseType !== 'stone') return
    const flow = placeFood(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => placeFood(state, player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B107_Manservant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Manservant',
    deck: 'B',
    number: 107,
    category: 'FOOD_PROVIDER',
    desc: [
        'Once you live in a stone house, place 3 <FOOD> on each remaining round space. At the start of these rounds, you get the <FOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B107_Manservant_impl = B107_Manservant.impl
