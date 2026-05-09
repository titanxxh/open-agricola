import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  getStableTilesBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A74_StableTree } from '../../cards-display/A/A74_StableTree'

const CARD_ID = A74_StableTree.id

const USED_ACTION_TOKEN_KEY = 'usedActionToken'

const queueStableTreeWood = (
  state: CardListenerContext['state'],
  player: CardListenerContext['player'],
) => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getStableTilesBuiltThisAction(player) < 1) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return queueFutureMeeplesFlow(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 3,
    resources: { wood: 1 },
  })
}

const listener: CardListenerRegistration = {
  id: 'A74-stable-tree-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = queueStableTreeWood(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

export const A74_StableTree_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => queueStableTreeWood(state, player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
