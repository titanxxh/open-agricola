import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A120_ClayHutBuilder } from '../../cards-display/A/A120_ClayHutBuilder'
export { A120_ClayHutBuilder }

const CARD_ID = A120_ClayHutBuilder.id

/**
 * A120 Clay Hut Builder
 * Once you no longer live in a wooden house, place 2 clay on each of the
 * next 5 round spaces. At the start of these rounds, you get the clay.
 *
 * BGA: onBuy delegates to onPlayerAfterRenovation. The card is flagged
 * after first trigger so it cannot fire twice.
 */

const placeClay = (
  state: GameState,
  player: PlayerState,
) => {
  if (player.houseType === 'wood') return
  if (isCardFlagged(player, CARD_ID)) return

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

export const A120_ClayHutBuilder_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => placeClay(state, player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
