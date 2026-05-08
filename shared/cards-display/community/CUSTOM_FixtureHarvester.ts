import { MinorImprovement } from '../types'

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
