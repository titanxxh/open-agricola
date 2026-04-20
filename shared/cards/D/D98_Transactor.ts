import { Occupation } from '../types'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D98_Transactor'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

export const D98_Transactor = new Occupation({
  id: CARD_ID,
  name: "Transactor",
  deck: "D",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ["Immediately before the final harvest at the end of round 14, you can take all the building resources that are left on the entire game board."],
  cost: {},
  players: "1+",
})

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
