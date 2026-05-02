import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../game/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B21_HayloftBarn'

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0], count: number) => {
  writeCardInfobox(player, CARD_ID, count > 0 ? `${count} Food` : 'Empty')
}

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
  actions: ['collect', 'gain', 'receive'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const grainGained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.grain ?? 0)
      : 0
    if (grainGained <= 0) return
    const foodCount = readCardExtraData<number>(context.player, CARD_ID, 'foodCount') ?? 0
    if (foodCount <= 0) return
    const newCount = foodCount - 1
    writeCardExtraData(context.player, CARD_ID, 'foodCount', newCount)
    updateInfobox(context.player, newCount)
    return { flow: buildFlow(newCount, context.player), sourceCard: CARD_ID }
  },
}

export const B21_HayloftBarn = new MinorImprovement({
  id: CARD_ID,
  name: 'Hayloft Barn',
  deck: 'B',
  number: 21,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 4 <FOOD> on this card. Each time you obtain at least 1 <GRAIN>, you also get 1 <FOOD> from this card. Once it is empty, you get a __Family Growth Even without Room__ action.'],
  cost: { wood: 3 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  newSet: true,
})

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
