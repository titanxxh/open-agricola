import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'

export const C37_DwellingMound = new MinorImprovement({
  id: "C37_DwellingMound",
  name: "Dwelling Mound",
  deck: "C",
  number: 37,
  category: "POINTS_PROVIDER",
  desc: ["From now on, you must pay 1 <FOOD> for each new field tile that you place in your farmyard."],
  cost: {"food":1},
  prerequisite: "Play in Round 3 or Before",
  modifier: {
    type: 'bonus',
    cardId: 'C37_DwellingMound',
    appliesTo: ['plow'],
    discount: { grain: 1 },
  } as BonusModifier,
})
