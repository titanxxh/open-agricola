import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot-state'
import { getActionNewlyUsedTiles } from '../helpers/farmyard-events'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C048_Farmstead'
const turnReceipt = (key: string, token: number): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key, value: token },
})

const qualification: CardListenerRegistration = {
  id: 'C48-farmstead-qualify',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['plow', 'construct', 'stables', 'fence', 'selection', 'special-effect'],
  handler: context => {
    const token = readActionSnapshotToken(context.player)
    if (token === undefined) return
    if (!context.triggerSnapshot?.players[context.player.id]?.played.includes(CARD_ID)) return
    if (readCardExtraData(context.player, CARD_ID, 'qualifiedTurnToken') === token
      || readCardExtraData(context.player, CARD_ID, 'rewardedTurnToken') === token) return
    if (getActionNewlyUsedTiles(context).length === 0) return
    return { flow: turnReceipt('qualifiedTurnToken', token), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [qualification],
  effect: {
    id: CARD_ID,
    onEndTurn: (_state, player) => {
      const token = readActionSnapshotToken(player)
      if (token === undefined || readCardExtraData(player, CARD_ID, 'qualifiedTurnToken') !== token
        || readCardExtraData(player, CARD_ID, 'rewardedTurnToken') === token) return
      return {
        type: 'seq',
        children: [turnReceipt('rewardedTurnToken', token), gainLeaf(CARD_ID, { food: 1 })],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C048_Farmstead = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Farmstead',
    deck: 'C',
    number: 48,
    category: 'FOOD_PROVIDER',
    desc: [
        'After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.',
      ],
    cost: {},
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const C048_Farmstead_impl = C048_Farmstead.impl
