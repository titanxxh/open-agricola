import { pushToCardStack, getCardStack, writeCardInfobox } from '../helpers/card-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D126_FieldCultivator } from '../../cards-display/D/D126_FieldCultivator'

const CARD_ID = D126_FieldCultivator.id

/**
 * Stack order (bottom to top): wood, clay, reed, stone, reed, clay, wood.
 * First popped will be 'wood' (top).
 */
const STACK_ITEMS = ['wood', 'clay', 'reed', 'stone', 'reed', 'clay', 'wood']

const updateInfobox = (player: PlayerState) => {
  const stack = getCardStack(player, CARD_ID)
  if (stack.length > 0) {
    writeCardInfobox(player, CARD_ID, `${stack.length} goods`)
  }
}

export const D126_FieldCultivator_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, STACK_ITEMS)
    updateInfobox(player)
  },
  onAfterReap: (state, player) => {
    const stack = getCardStack(player, CARD_ID)
    if (stack.length === 0) return

    // Count how many fields were harvested this reap
    const summary = state.harvestReapSummary?.[player.id]
    if (!summary) return
    const fieldsHarvested = (summary.grainFields ?? 0) + (summary.vegetableFields ?? 0)
    if (fieldsHarvested <= 0) return

    const popsNeeded = Math.min(fieldsHarvested, stack.length)
    if (popsNeeded <= 0) return

    // Build a sequence of pop-card-stack nodes
    const children: ActionFlow[] = []
    for (let i = 0; i < popsNeeded; i++) {
      children.push({ type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID })
    }
    // Update infobox after pops
    children.push({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-infobox', text: `${Math.max(0, stack.length - popsNeeded)} goods` },
    })

    return { type: 'seq', children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
