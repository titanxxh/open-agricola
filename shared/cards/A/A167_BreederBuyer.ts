import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  getStableTilesBuiltThisAction,
  getRoomsBuiltThisAction,
} from '../helpers/action-snapshot'
import { writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf, readTurnScopeToken, USED_THIS_TURN_KEY } from '../helpers/turn-token'

const CARD_ID = 'A167_BreederBuyer'

/**
 * A167 Breeder Buyer:
 * Each time you build at least 1 room and at least 1 stable on the same turn,
 * you also get 1 sheep/pig/cattle depending on room type (wood/clay/stone).
 *
 * Rule:
 * - onBuy: check if room+stable built same turn → grant livestock
 * - afterConstruct: if stables also built this turn → grant livestock (by room type)
 * - afterStables: if rooms also built this turn → grant livestock (by room type)
 * - uses setUsedOnTurnId / usableThisTurn to fire only once per action.
 */

const GAINS = {
  wood: { sheep: 1 },
  clay: { boar: 1 },
  stone: { cattle: 1 },
}

const buildLivestockFlow = (
  player: PlayerState,
  needStables: boolean,
  needRooms: boolean,
): ActionFlow | undefined => {
  if (isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  if (!mark) return

  const stablesBuilt = getStableTilesBuiltThisAction(player)
  const roomsBuilt = getRoomsBuiltThisAction(player)

  if (needStables && stablesBuilt < 1) return
  if (needRooms && roomsBuilt < 1) return

  const houseType = player.houseType
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
    const flow = buildLivestockFlow(context.player, true, false)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const afterStablesListener: CardListenerRegistration = {
  id: 'A167-breeder-buyer-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = buildLivestockFlow(context.player, false, true)
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterConstructListener, afterStablesListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (getStableTilesBuiltThisAction(player) < 1 || getRoomsBuiltThisAction(player) < 1) return
    const token = readTurnScopeToken(player)
    if (token === undefined || isUsedThisTurn(player, CARD_ID)) return
    const gain = GAINS[player.houseType]
    if (!gain) return
    writeCardExtraData(player, CARD_ID, USED_THIS_TURN_KEY, token)
    return gainLeaf(CARD_ID, gain)
  },
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
