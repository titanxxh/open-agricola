import { MinorImprovement } from '../types'

const CARD_ID = 'E80_RockGarden'

export const E80_RockGarden = new MinorImprovement({
  id: CARD_ID,
  name: 'Rock Garden',
  deck: 'E',
  number: 80,
  category: 'BUILDING_RESOURCES_-_STONE',
  desc: [
    'You can only plant <STONE> on this card. Plant as though it were 3 fields, but it is considered 1 field. Sow and harvest <STONE> on this card as you would vegetables.',
  ],
  isField: true,
})
