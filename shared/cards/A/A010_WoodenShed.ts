import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A010_WoodenShed'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: () => 1,
},
  prerequisiteCheck: (player) => player.houseType === 'wood',
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A010_WoodenShed = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wooden Shed',
    deck: 'A',
    number: 10,
    category: 'FARM_PLANNER',
    desc: ['This card can only be played via a __Major Improvement__ action. It provides room for one person. You may no longer renovate.'],
    cost: { wood: 2, reed: 1 },
    prerequisite: 'Still in Wooden House',
    mustBePlayedViaMajorImprovementAction: true,
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A010_WoodenShed_impl = A010_WoodenShed.impl
