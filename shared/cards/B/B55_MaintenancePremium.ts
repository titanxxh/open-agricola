import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B55_MaintenancePremium'

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// After using a wood accumulation space: get 1 food from card
const woodCollectListener: CardListenerRegistration = {
  id: 'B55-maintenance-premium-after-collect-wood',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

// After renovation: restock to 3 food
const renovationListener: CardListenerRegistration = {
  id: 'B55-maintenance-premium-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'foodCount', 3)
    updateInfobox(context.player, 3)
  },
}

export const B55_MaintenancePremium = new MinorImprovement({
  id: CARD_ID,
  name: 'Maintenance Premium',
  deck: 'B',
  number: 55,
  category: 'FOOD_PROVIDER',
  desc: ['Place 3 <FOOD> on this card. Each time you use a wood accumulation space, you get 1 <FOOD> from this card. Each time you renovate restock this card to 3 <FOOD>.'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const B55_MaintenancePremium_impl = {
  listeners: [woodCollectListener, renovationListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 3)
    updateInfobox(player, 3)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
