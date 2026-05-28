import { familySize, newbornCount } from '../../domain/player'
import { registerHarvestFeedingRequirementModifier } from '../../actions/helpers/harvest-feeding-requirement'
import type { CardImpl } from '../registry'
import { E30_ChildsToy } from '../../cards-display/E/E30_ChildsToy'

const CARD_ID = E30_ChildsToy.id

registerHarvestFeedingRequirementModifier(CARD_ID, ({ newbornCount }) => newbornCount)

export const E30_ChildsToy_impl = {
  prerequisiteCheck: (player) => familySize(player) - newbornCount(player) === 2,
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
