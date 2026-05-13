import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B55_MaintenancePremium } from '../../cards-display/B/B55_MaintenancePremium'

const CARD_ID = B55_MaintenancePremium.id

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, `${count} Food`)
}

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const setStoredFoodFlow = (count: number): ActionFlow[] => [
  specialEffect({ kind: 'set-extra-data', key: 'foodCount', value: count }),
  specialEffect({ kind: 'set-infobox', text: `${count} Food` }),
]

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

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
    return {
      flow: {
        type: 'seq',
        children: [
          ...setStoredFoodFlow(newCount),
          gainLeaf(CARD_ID, { food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const renovationListener: CardListenerRegistration = {
  id: 'B55-maintenance-premium-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'seq',
        children: setStoredFoodFlow(3),
      },
      sourceCard: CARD_ID,
    }
  },
}

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
