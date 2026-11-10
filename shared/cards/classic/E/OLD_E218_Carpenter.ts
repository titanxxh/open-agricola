import { defineOccupationCard } from '../../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../../card-listeners'
import type { ActionHookResult } from '../../../actions/hooks'
import type { CardImpl } from '../../registry'
import { constructedRoomMaterial, constructUnitPriceTrade } from '../../helpers/construct-cost'

const CARD_ID = 'OLD_E218_Carpenter'
/**
 * E218 Carpenter — Every new room only costs 3 of the appropriate building resource
 * and 2 reed (instead of the standard 5+2).
 *
 * Reference: onPlayerComputeCostsConstruct calls Utils::addCost with [res => 3, REED => 2].
 */
const constructCostListener: CardListenerRegistration = {
  id: 'OLD_E218_Carpenter-carpenter-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const material = constructedRoomMaterial(context) ?? context.player.houseType
    return {
      trades: [{
        ...constructUnitPriceTrade(context, CARD_ID, { [material]: 3, reed: 2 }),
        groupId: 'classic-room-base',
        groupMax: 1,
        groupScope: 'unit',
      }],
    }
  },
}
const cardImpl = {
  listeners: [constructCostListener],
} satisfies CardImpl
export const OLD_E218_Carpenter = defineOccupationCard({
  meta: {
    id: 'OLD_E218_Carpenter',
    name: '木匠',
    deck: 'E',
    number: 218,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
      '你扩建每间房屋只需花费2捆芦苇和3份对应你房屋类型的建材。例如：扩建1间石屋只需2捆芦苇+3个石头。',
    ],
    cost: {},
    players: '1+',
    vp: 0,
    prerequisite: '',
    passing: false,
    extraVp: false,
    implemented: true,
    locales: {
      zh: {
        name: '木匠',
        desc: [
          '你扩建每间房屋只需花费2捆芦苇和3份对应你房屋类型的建材。例如：扩建1间石屋只需2捆芦苇+3个石头。',
        ],
        prerequisite: '',
      },
    },
  },
  impl: cardImpl,
})
export const OLD_E218_Carpenter_impl = OLD_E218_Carpenter.impl
