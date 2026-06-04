import { defineOccupationCard } from '../card-source'
import type { BonusModifier, TradeModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B145_BrushwoodCollector'

/**
 * B145 Brushwood Collector — Each time you renovate or build a room,
 * you can replace the required 1 or 2 <REED> with a total of 1 <WOOD>.
 *
 * BGA reference:
 * - onPlayerComputeCostsConstruct: for each trade that contains REED, creates an
 *   alternative with WOOD +1 and REED removed (all reed replaced by 1 wood).
 * - onPlayerComputeCostsRenovation: for each fee with 1 or 2 REED, creates an
 *   alternative with WOOD +1 and all REED removed.
 *
 * Implementation uses TradeModifiers to provide optional alternatives:
 * - construct: from { wood: 1 } to up to 2 reed — replace room reed with 1 wood
 * - renovation: bounded bonus choices replace exactly 1 or 2 reed with 1 wood
 */

export const B145_BrushwoodCollector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Brushwood Collector',
    deck: 'B',
    number: 145,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time you renovate or build a room, you can replace the required 1 or 2 <REED> with a total of 1 <WOOD>.'],
    cost: {},
    players: '3+',
  },
  impl: {
  modifiers: [
    ...([
        {
          type: 'trade',
          cardId: CARD_ID,
          appliesTo: ['construct'],
          // scope:'unit' applies this replacement to each room cost row, matching
          // BGA's per-room `addCost` alternative.
          scope: 'unit',
          order: 20,
          replaceUpTo: true,
          from: { wood: 1 },
          to: { reed: 2 },
        },
        {
          type: 'bonus',
          cardId: CARD_ID,
          appliesTo: ['renovation'],
          optional: true,
          choices: [
            { discount: { reed: 1, wood: -1 }, sources: [CARD_ID], minCost: { reed: 1 }, maxCost: { reed: 1 } },
            { discount: { reed: 2, wood: -1 }, sources: [CARD_ID], minCost: { reed: 2 }, maxCost: { reed: 2 } },
          ],
        },
      ] as (TradeModifier | BonusModifier)[]),
  ],
} satisfies CardImpl,
})

export const B145_BrushwoodCollector_impl = B145_BrushwoodCollector.impl
