import { MinorImprovement } from '../types'

const CARD_ID = 'E83_ShepherdsWhistle'

export const E83_ShepherdsWhistle = new MinorImprovement({
  id: CARD_ID,
  name: "Shepherd's Whistle",
  deck: 'E',
  number: 83,
  category: 'ANIMALS_',
  desc: ['At the start of the breeding phase of each harvest, if you have at least 1 unfenced stable without an animal, you get 1 <SHEEP>.'],
  cost: { wood: 1 },
})
