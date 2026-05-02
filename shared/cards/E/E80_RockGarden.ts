import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E80_RockGarden'

/**
 * Sprint 7d (isField stub): full sow / harvest behaviour deferred to a later
 * sprint — needs sow-multiple infrastructure + STONE-as-crop modelling on a
 * field card (CAN_SOW_MULTIPLE, "as though 3 fields"). For now we register
 * the card with `isField: true` so C80 Rocky Terrain can fire on its onBuy
 * event (BGA "playing field cards counts as plowing"); `implemented: false`
 * keeps it out of the dealt pool until the full mechanic lands.
 */
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
  implemented: false,
})

export const E80_RockGarden_impl = {
  reaches: [] as readonly string[],
} satisfies CardImpl
