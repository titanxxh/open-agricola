import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  getStableTilesBuiltThisAction,
  getRoomsBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A167_BreederBuyer'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

/**
 * A167 Breeder Buyer:
 * Each time you build at least 1 room and at least 1 stable on the same turn,
 * you also get 1 sheep/pig/cattle depending on room type (wood/clay/stone).
 *
 * BGA:
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

const tryGainLivestock = (
  context: CardListenerContext,
  needStables: boolean,
  needRooms: boolean,
): ActionHookResult | void => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return
  if (readCardExtraData<number>(context.player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  const stablesBuilt = getStableTilesBuiltThisAction(context.player)
  const roomsBuilt = getRoomsBuiltThisAction(context.player)

  if (needStables && stablesBuilt < 1) return
  if (needRooms && roomsBuilt < 1) return

  const houseType = context.player.houseType
  const gain = GAINS[houseType]
  if (!gain) return

  writeCardExtraData(context.player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
}

const afterConstructListener: CardListenerRegistration = {
  id: 'A167-breeder-buyer-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return tryGainLivestock(context, true, false)
  },
}

const afterStablesListener: CardListenerRegistration = {
  id: 'A167-breeder-buyer-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return tryGainLivestock(context, false, true)
  },
}

const cardImpl = {
  listeners: [afterConstructListener, afterStablesListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const stablesBuilt = getStableTilesBuiltThisAction(player)
    const roomsBuilt = getRoomsBuiltThisAction(player)
    if (stablesBuilt < 1 || roomsBuilt < 1) return
    const actionToken = readActionSnapshotToken(player)
    if (actionToken !== undefined) {
      writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
    }
    const houseType = player.houseType
    const gain = GAINS[houseType]
    if (!gain) return
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
