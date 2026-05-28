import { familySize } from '../../domain/player'
import { registerHarvestFeedingRequirementModifier } from '../../actions/helpers/harvest-feeding-requirement'
import type { CardImpl } from '../registry'
import { E159_OldMiser } from '../../cards-display/E/E159_OldMiser'

const CARD_ID = E159_OldMiser.id

registerHarvestFeedingRequirementModifier(CARD_ID, ({ familySize }) => -familySize)

export const E159_OldMiser_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      return -familySize(player)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
