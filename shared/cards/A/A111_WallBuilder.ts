import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  getRoomsBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A111_WallBuilder } from '../../cards-display/A/A111_WallBuilder'
export { A111_WallBuilder }

const CARD_ID = A111_WallBuilder.id

const USED_ACTION_TOKEN_KEY = 'usedActionToken'

const queueFoodNextFour = (state: GameState, player: PlayerState) => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getRoomsBuiltThisAction(player) < 1) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return queueFutureMeeplesFlow(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 4,
    resources: { food: 1 },
  })
}

const listener: CardListenerRegistration = {
  id: 'A111-wall-builder-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = queueFoodNextFour(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

export const A111_WallBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
