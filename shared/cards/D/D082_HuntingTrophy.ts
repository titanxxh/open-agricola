import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getExchangesInWindow } from '../../actions/effects/exchange'
import { getCardDefinitionById } from '../helpers/card-type'
import { payLeaf } from '../helpers/pay-gain-node'
import type { Bonus, Trade } from '../../contract/types'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'D082_HuntingTrophy'
const FARM_REDEV = 'farm-redevelopment'

const HOUSE_REDEV = 'house-redevelopment'

const isFarmRedev = (context: CardListenerContext): boolean =>
  (context.actionCardId ?? context.space?.id) === FARM_REDEV

const isHouseRedev = (context: CardListenerContext): boolean =>
  (context.actionCardId ?? context.space?.id) === HOUSE_REDEV

const farmRedevFenceCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-farm-redevelopment-fence-compute-costs',
  monotoneFenceCost: true,
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFarmRedev(context)) return
    const trade: Trade = {
      from: {},
      to: { wood: 1 },
      max: 3,
      scope: 'action',
      sourceId: CARD_ID,
    }
    return { trades: [trade] }
  },
}

const farmRedevFenceIsDoableListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-farm-redevelopment-fence-isdoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (!isFarmRedev(context)) return
    if (!canStartFencing(context.state, context.player, { wood: -3 })) return
    return { doable: true }
  },
}

const improvementCostListener: CardListenerRegistration = {
  id: 'D82-hunting-trophy-improvement-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isHouseRedev(context)) return
    const bonus: Bonus = {
      choices: [
        { discount: { wood: 1 }, sources: [CARD_ID] },
        { discount: { clay: 1 }, sources: [CARD_ID] },
        { discount: { stone: 1 }, sources: [CARD_ID] },
        { discount: { reed: 1 }, sources: [CARD_ID] },
      ],
      optional: false,
      sources: [CARD_ID],
    }
    return { bonuses: [bonus] }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => player.resources.boar >= 1,
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => ({
      type: 'xor',
      children: [
        { ...payLeaf({ cardId: CARD_ID, cost: { boar: 1 } }), optionId: 'return-boar', choiceLabelKey: 'ui.interactionHuntingTrophyReturn' },
        ...getExchangesInWindow(player, 'anytime', state).filter((trade) =>
          trade.from.boar === 1 && Object.keys(trade.from).length === 1 && (trade.to.food ?? 0) > 0 &&
          getCardDefinitionById(trade.sourceId ?? '')?.isCookery,
        ).map((trade) => ({
          type: 'leaf' as const, actionId: 'exchange', sourceCard: CARD_ID,
          optionId: `cook:${trade.sourceId}`,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesPaid: trade.from, resourcesGained: trade.to },
          actionContext: { directTrade: trade },
        })),
      ],
    }),
  },
  listeners: [
    farmRedevFenceCostListener,
    farmRedevFenceIsDoableListener,
    improvementCostListener,
  ],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D082_HuntingTrophy = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hunting Trophy',
    deck: 'D',
    number: 82,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'To play this card, you must return or cook 1 <PIG>.',
        'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. <FENCE> built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
      ],
    vp: 1,
  },
  impl: cardImpl,
})

export const D082_HuntingTrophy_impl = D082_HuntingTrophy.impl
