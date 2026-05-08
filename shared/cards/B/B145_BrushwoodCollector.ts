import { Occupation } from '../../cards-display/types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'B145_BrushwoodCollector'

/**
 * B145 Brushwood Collector — Each time you renovate or build a room,
 * you can replace the required 1 or 2 <REED> with a total of 1 <WOOD>.
 *
 * BGA reference:
 * - onPlayerComputeCostsConstruct: for each trade that contains REED, creates an
 *   alternative with WOOD +1 and REED removed (all reed replaced by 1 wood).
 * - onPlayerComputeCostsRenovation: for each fee with REED > 0, creates an
 *   alternative with WOOD +1 and REED -1.
 *
 * Implementation uses TradeModifiers to provide optional alternatives:
 * - construct: from { wood: 1 } to { reed: 2 } — replace 2 reed with 1 wood
 * - renovation: from { wood: 1 } to { reed: 1 } — replace 1 reed with 1 wood
 */

export const B145_BrushwoodCollector = new Occupation({
  id: CARD_ID,
  name: 'Brushwood Collector',
  deck: 'B',
  number: 145,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you renovate or build a room, you can replace the required 1 or 2 <REED> with a total of 1 <WOOD>.'],
  cost: {},
  players: '3+',
  modifiers: [
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      from: { wood: 1 },
      to: { reed: 2 },
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      from: { wood: 1 },
      to: { reed: 1 },
    },
  ] as TradeModifier[],
})
