import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  hasBuiltStableThisTurn,
  roomTypeBuiltThisTurn,
} from '../helpers/action-snapshot'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf } from '../helpers/turn-token'

const CARD_ID = 'A167_BreederBuyer'

const GAINS = {
  wood: { sheep: 1 },
  clay: { boar: 1 },
  stone: { cattle: 1 },
}

const buildLivestockFlow = (
  player: PlayerState,
): ActionFlow | undefined => {
  if (isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  if (!mark) return

  if (!hasBuiltStableThisTurn(player)) return
  const houseType = roomTypeBuiltThisTurn(player)
  if (!houseType) return
  const gain = GAINS[houseType]
  if (!gain) return

  return {
    type: 'seq',
    children: [
      mark,
      gainLeaf(CARD_ID, gain),
    ],
  }
}

const afterConstructListener: CardListenerRegistration = {
  id: 'A167-breeder-buyer-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = buildLivestockFlow(context.player)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const afterStablesListener: CardListenerRegistration = {
  id: 'A167-breeder-buyer-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = buildLivestockFlow(context.player)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterConstructListener, afterStablesListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => buildLivestockFlow(player),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A167_BreederBuyer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Breeder Buyer',
    deck: 'A',
    number: 167,
    category: 'LIVESTOCK_PROVIDER',
    desc: [
        'Each time you build at least 1 <WOOD>/<CLAY>/stone room and at least 1 <STABLE> on the same turn, you also get 1 <SHEEP>/<PIG>/<CATTLE>.',
      ],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A167_BreederBuyer_impl = A167_BreederBuyer.impl
