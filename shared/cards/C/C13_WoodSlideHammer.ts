import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'C13_WoodSlideHammer'

/**
 * C13 Wood Slide Hammer:
 * On your first renovation (i.e. while still wood-roofed), if you have at
 * least 5 rooms, you get a 2 stone discount on the renovation cost.
 *
 * BGA: onPlayerComputeCostsRenovation, gated by roomType==='wood' && rooms>=5,
 * adds bonus -2 stone.
 *
 * Implementation: BonusModifier with conditions { houseTypeWood, minNumRooms:5 }.
 * `getModifiersForCostType` evaluates conditions against the player's current
 * state for non-construct cost types, so once the player renovates to clay /
 * stone (or has fewer than 5 rooms) the modifier is automatically filtered
 * out.
 */
export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Slide Hammer',
  deck: 'C',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['On your first renovation, if you have at least 5 wood rooms, you can renovate to stone directly and you get a discount of 2 <STONE> on the renovation cost.'],
  cost: { wood: 1 },
  newSet: true,
  modifier: {
    type: 'bonus',
    cardId: CARD_ID,
    appliesTo: ['renovation'],
    discount: { stone: 2 },
    conditions: { houseTypeWood: 1, minNumRooms: 5 },
  } as BonusModifier,
})
