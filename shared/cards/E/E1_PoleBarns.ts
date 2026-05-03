import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E1_PoleBarns'

// BGA isBuyable: Fences::getOnBoard($pId)->count() < 15 → false. getOnBoard
// returns all on-board fence segments (regular fences + wood palisades).
registerPrerequisite('15 Fences Built', (player) => player.fenceSegments.length >= 15)

export const E1_PoleBarns = new MinorImprovement({
  id: CARD_ID,
  name: 'Pole Barns',
  deck: 'E',
  number: 1,
  category: 'PASSING_-_FARMYARD',
  desc: ['You can immediately build up to 3 stables at no cost. (You must pay the cost of this card though.)'],
  cost: { wood: 2 },
  passing: true,
  prerequisite: '15 Fences Built',
})

export const E1_PoleBarns_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    params: { max: 3, freeCost: true },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
