import type { CardImpl } from '../registry'
import { CUSTOM_FixtureHarvester } from '../../cards-display/community/CUSTOM_FixtureHarvester'

const CARD_ID = CUSTOM_FixtureHarvester.id

export const CUSTOM_FixtureHarvester_impl = {
  effect: {
    id: CARD_ID,
    onHarvest: () => ({
      type: 'leaf' as const,
      actionId: 'gain' as const,
      params: { food: 1 },
      sourceCard: CARD_ID,
    }),
  },
} satisfies CardImpl
