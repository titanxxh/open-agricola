import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'CUSTOM_FixtureHarvester'

export const CUSTOM_FixtureHarvester = new MinorImprovement({
  id: CARD_ID,
  name: 'Fixture Harvester',
  deck: 'community',
  number: 0,
  desc: ['Each harvest, gain 1 <FOOD>. (Community deck fixture card; not a real card.)'],
  cost: { wood: 1 },
  vp: 0,
})

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
