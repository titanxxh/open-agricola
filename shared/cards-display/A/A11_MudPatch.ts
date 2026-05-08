import { MinorImprovement } from '../types'

const CARD_ID = 'A11_MudPatch'

export const A11_MudPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Mud Patch',
  deck: 'A',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you immediately get 1 <PIG>. You can hold 1 <PIG> on each of your unplanted field tiles.'],
})
