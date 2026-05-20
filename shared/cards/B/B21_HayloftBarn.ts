import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { B21_HayloftBarn } from '../../cards-display/B/B21_HayloftBarn'
import { hasExchangeGained, hasResourceMovedToPlayer } from '../helpers/event-provenance'

const CARD_ID = B21_HayloftBarn.id

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, count > 0 ? `${count} Food` : 'Empty')
}

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

const setStoredFoodFlow = (count: number): ActionFlow[] => [
  specialEffect({ kind: 'set-extra-data', key: 'foodCount', value: count }),
  specialEffect({ kind: 'set-infobox', text: count > 0 ? `${count} Food` : 'Empty' }),
]

const familyGrowthLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'family-growth',
  sourceCard: CARD_ID,
  actionContext: { skipRoomCheck: true },
})

const hasInactiveWorker = (player: PlayerState) =>
  player.workers.some((w) => !w.isActive)

const buildFlow = (newCount: number, player: PlayerState): ActionFlow => {
  const food = gainLeaf(CARD_ID, { food: 1 })
  // BGA: when card just emptied AND player has farmer in reserve and family <= 4,
  // grant family-growth-without-room.
  if (newCount === 0 && hasInactiveWorker(player) && player.workers.filter((w) => w.isActive).length <= 4) {
    return {
      type: 'seq',
      children: [food, familyGrowthLeaf()],
    }
  }
  return food
}

/**
 * Detect grain gain from collect, gain, and receive actions.
 * When player obtains at least 1 grain, release 1 food from card.
 * When the card empties, also grant a Family Growth Even without Room action.
 */
const grainGainListener: CardListenerRegistration = {
  id: 'B21-hayloft-barn-after-grain-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect', 'gain', 'receive', 'exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return
    const grainGained = hasExchangeGained(context.transactionEvents, 'grain') ||
      hasResourceMovedToPlayer(context.transactionEvents, 'grain', context.player.id)
    if (!grainGained) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    return {
      flow: {
        type: 'seq',
        children: [
          ...setStoredFoodFlow(newCount),
          buildFlow(newCount, context.player),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B21_HayloftBarn_impl = {
  listeners: [grainGainListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'foodCount', 4)
    updateInfobox(player, 4)
  },
  // Also detect grain from harvest (reap phase)
  onAfterReap: (state, player) => {
    const grainFields = state.harvestReapSummary?.[player.id]?.grainFields
      ?? player.fields.filter((field) => fieldHasCrop(field, 'grain')).length
    if (grainFields <= 0) return
    const foodCount = readCardExtraData<number>(player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    writeCardExtraData(player, CARD_ID, 'foodCount', newCount)
    updateInfobox(player, newCount)
    return buildFlow(newCount, player)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
