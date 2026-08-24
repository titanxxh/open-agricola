import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { futureMeeplesNode, queueFutureMeeples } from '../../actions/effects/internal/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A120_ClayHutBuilder'
/**
 * A120 Clay Hut Builder
 * Once you no longer live in a wooden house, place 2 clay on each of the
 * next 5 round spaces. At the start of these rounds, you get the clay.
 *
 * Rule: onBuy delegates to onPlayerAfterRenovation. The card is flagged
 * after first trigger so it cannot fire twice.
 */

const placeClay = (
  state: GameState,
  player: PlayerState,
): ActionFlow | undefined => {
  if (player.houseType === 'wood') return
  if (isCardFlagged(player, CARD_ID)) return

  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-flag', flag: true },
      },
      futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        startRound: state.round + 1,
        count: 5,
        resources: { clay: 2 },
      }),
    ],
  }
}

const placeClayOnBuy = (state: GameState, player: PlayerState) => {
  if (player.houseType === 'wood' || isCardFlagged(player, CARD_ID)) return
  setCardFlag(player, CARD_ID, true)
  queueFutureMeeples(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 5,
    resources: { clay: 2 },
  })
  return futureMeeplesNode()
}

const listener: CardListenerRegistration = {
  id: 'A120-clay-hut-builder-after-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = placeClay(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => placeClayOnBuy(state, player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A120_ClayHutBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Hut Builder',
    deck: 'A',
    number: 120,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'Once you no longer live in a wooden house, place 2 <CLAY> on each of the next 5 round spaces. At the start of these rounds, you get the <CLAY>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A120_ClayHutBuilder_impl = A120_ClayHutBuilder.impl
