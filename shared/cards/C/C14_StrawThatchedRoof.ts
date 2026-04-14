import { MinorImprovement } from '../types'
import type { BonusModifier } from '../../game/types'

const CARD_ID = 'C14_StrawThatchedRoof'

/**
 * C14 Straw-Thatched Roof — You no longer need reed to renovate or build a room.
 *
 * BGA reference: removes reed from construct and renovation costs.
 * Prerequisite: 3 Grain Fields.
 *
 * We model reed removal as a large discount (99 reed) since the bonus system
 * caps at available cost. This effectively removes all reed from the cost.
 */

export const C14_StrawThatchedRoof = new MinorImprovement({
  id: CARD_ID,
  name: 'Straw-Thatched Roof',
  deck: 'C',
  number: 14,
  category: 'FARM_PLANNER',
  desc: ['You no longer need <REED> to renovate or build a room.'],
  cost: {},
  vp: 1,
  prerequisite: '3 Grain Fields',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { reed: 99 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { reed: 99 },
    },
  ] as BonusModifier[],
})
