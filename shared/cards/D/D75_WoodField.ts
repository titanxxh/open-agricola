import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D75_WoodField'

/**
 * Sprint 7d (isField stub): full sow / harvest behaviour deferred to a later
 * sprint — needs sow-multiple infrastructure + WOOD-as-crop modelling on a
 * field card (CAN_SOW_MULTIPLE). For now we register the card with `isField:
 * true` so C80 Rocky Terrain can fire on its onBuy event (BGA "playing field
 * cards counts as plowing"); `implemented: false` keeps it out of the dealt
 * pool until the full mechanic lands.
 */
export const D75_WoodField = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Field',
  deck: 'D',
  number: 75,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'You can plant <WOOD> on this card as though it were 2 fields, but it is considered 1 field. Sow and harvest <WOOD> on this card as you would <GRAIN>.',
  ],
  vp: 1,
  cost: { food: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  isField: true,
  implemented: false,
})

export const D75_WoodField_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
