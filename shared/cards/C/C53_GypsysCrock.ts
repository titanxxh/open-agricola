import { MinorImprovement } from '../types'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C53_GypsysCrock'

const COUNTED_GOODS = ['sheep', 'boar', 'cattle', 'grain', 'vegetable', 'wood', 'clay', 'reed', 'stone'] as const

const countGoods = (player: PlayerState) =>
  COUNTED_GOODS.reduce((sum, key) => sum + (player.resources[key] ?? 0), 0)

const beforeExchangeListener: CardListenerRegistration = {
  id: 'C53-gypsys-crock-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'goodsBefore', countGoods(context.player))
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'C53-gypsys-crock-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['anytime-exchange'],
  handler: (context): ActionHookResult | void => {
    const goodsBefore = readCardExtraData<number>(context.player, CARD_ID, 'goodsBefore') ?? 0
    const goodsAfter = countGoods(context.player)
    const goodsLost = goodsBefore - goodsAfter
    if (goodsLost < 2) return
    const bonus = Math.floor(goodsLost / 2)
    return {
      flow: gainLeaf(CARD_ID, { food: bonus }),
      sourceCard: CARD_ID,
    }
  },
}

export const C53_GypsysCrock = new MinorImprovement({
  id: CARD_ID,
  name: "Gypsy's Crock",
  deck: 'C',
  number: 53,
  category: 'FOOD_PROVIDER',
  desc: ["Each time you use a cooking improvement to turn 2 goods into <FOOD> at the same time, you get 1 additional <FOOD>."],
  cost: { clay: 2 },
  vp: 1,
})

export const C53_GypsysCrock_impl = {
  listeners: [beforeExchangeListener, afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
