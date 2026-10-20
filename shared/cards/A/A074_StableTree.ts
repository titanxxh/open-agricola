import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { futureMeeplesNode, queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  getStableTilesBuiltThisAction,
} from '../helpers/action-snapshot'
import { writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf, readTurnScopeToken, USED_THIS_TURN_KEY } from '../helpers/turn-token'

const CARD_ID = 'A074_StableTree'

const queueStableTreeWood = (
  state: CardListenerContext['state'],
  player: CardListenerContext['player'],
) => {
  if (getStableTilesBuiltThisAction(player) < 1 || isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  if (!mark) return

  return {
    type: 'seq' as const,
    children: [
      mark,
      futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        startRound: state.round + 1,
        count: 3,
        resources: { wood: 1 },
      }),
    ],
  }
}

const queueStableTreeWoodOnBuy = (
  state: CardListenerContext['state'],
  player: CardListenerContext['player'],
) => {
  const token = readTurnScopeToken(player)
  if (token === undefined || getStableTilesBuiltThisAction(player) < 1 || isUsedThisTurn(player, CARD_ID)) return
  writeCardExtraData(player, CARD_ID, USED_THIS_TURN_KEY, token)
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

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => queueStableTreeWoodOnBuy(state, player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A074_StableTree = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stable Tree",
    deck: "A",
    number: 74,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time you build 1 or more <STABLE> on your turn, place 1 <WOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <WOOD>."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const A074_StableTree_impl = A074_StableTree.impl
