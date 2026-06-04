import { defineMinorCard } from '../card-source'
import { familySize, newbornCount } from '../../domain/player'
import { registerHarvestFeedingRequirementModifier } from '../../actions/helpers/harvest-feeding-requirement'
import type { CardImpl } from '../registry'

const CARD_ID = 'E30_ChildsToy'
registerHarvestFeedingRequirementModifier(CARD_ID, ({ newbornCount }) => newbornCount)

const cardImpl = {
  prerequisiteCheck: (player) => familySize(player) - newbornCount(player) === 2,
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E30_ChildsToy = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Child's Toy",
    deck: 'E',
    number: 30,
    category: 'BONUS_POINTS_-_GET',
    desc: ['During the feeding phase of each harvest, your newborns require 2 <FOOD> (instead of 1).'],
    altCosts: [{ wood: 1 }, { clay: 1 }],
    vp: 2,
    prerequisite: 'Exactly 2 Adults',
  },
  impl: cardImpl,
})

export const E30_ChildsToy_impl = E30_ChildsToy.impl
