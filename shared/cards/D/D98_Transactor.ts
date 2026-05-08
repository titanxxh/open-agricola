import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D98_Transactor } from '../../cards-display/D/D98_Transactor'
export { D98_Transactor }

const CARD_ID = D98_Transactor.id

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

export const D98_Transactor_impl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (state, _player) => {
    if (state.round !== 14) return

    // Collect all building resources from action spaces (imperative mutation, auto-collect)
    const total: Partial<Record<string, number>> = {}
    for (const space of state.actionSpaces) {
      for (const res of BUILDING_RESOURCES) {
        const amt = space.resources[res] ?? 0
        if (amt > 0) {
          total[res] = (total[res] ?? 0) + amt
          space.resources[res] = 0
        }
      }
    }

    if (Object.keys(total).length === 0) return

    // Auto-collect (not optional): the board zeroing and gain happen together
    return {
      type: 'leaf',
      actionId: 'gain',
      params: total,
      sourceCard: CARD_ID,
    } satisfies ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
