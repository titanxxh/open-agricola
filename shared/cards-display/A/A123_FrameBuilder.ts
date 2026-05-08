import { Occupation } from '../types'
import type { BonusModifier } from '../../contract/types'

const CARD_ID = 'A123_FrameBuilder'

/**
 * A123 Frame Builder — Each time you build a room/renovate, but only once per
 * room/action, you can replace exactly 2 CLAY or 2 STONE with 1 WOOD.
 *
 * BGA reference: onPlayerComputeCostsConstruct / Renovation use
 *   addBonusChoices([[wood:+1, clay:-2], [wood:+1, stone:-2]], source, optional:true)
 * which expresses "pick at most one of these exchanges per action".
 *
 * Our earlier implementation used four independent TradeModifier entries, which
 * allowed the player to simultaneously trigger BOTH the clay-replace and the
 * stone-replace in a single action (e.g. 4 clay + 4 stone + 2 wood → 0 clay +
 * 0 stone + 0 wood paid). That is stronger than BGA. Migrated to bonus.choices
 * to align with BGA semantics.
 *
 * Discount convention: positive = reduce cost of that resource; negative = add
 * to cost. So `{ wood: -1, clay: 2 }` means "pay 1 more wood, save 2 clay".
 */

export const A123_FrameBuilder = new Occupation({
  id: CARD_ID,
  name: 'Frame Builder',
  deck: 'A',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      optional: true,
      choices: [
        { discount: { wood: -1, clay: 2 }, sources: [CARD_ID] },
        { discount: { wood: -1, stone: 2 }, sources: [CARD_ID] },
      ],
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      optional: true,
      choices: [
        { discount: { wood: -1, clay: 2 }, sources: [CARD_ID] },
        { discount: { wood: -1, stone: 2 }, sources: [CARD_ID] },
      ],
    },
  ] as BonusModifier[],
})
