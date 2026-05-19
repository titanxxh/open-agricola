import { Occupation } from '../types'
import type { BonusModifier, TradeModifier } from '../../contract/types'

const CARD_ID = 'A123_FrameBuilder'

/**
 * A123 Frame Builder — Each time you build a room/renovate, but only once per
 * room/action, you can replace exactly 2 CLAY or 2 STONE with 1 WOOD.
 *
 * BGA reference: onPlayerComputeCostsConstruct / Renovation use
 *   addBonusChoices([[wood:+1, clay:-2], [wood:+1, stone:-2]], source, optional:true)
 * which expresses "pick at most one of these exchanges per action".
 *
 * Construct: split into two `scope:'unit'` TradeModifiers (one per house
 * type) so the per-room budget (Σ-times ≤ nb) bounds the substitution
 * count. The `houseType*` conditions only allow the matching trade to
 * apply. `max` is omitted; `scope:'unit'` defaults its cap to `nb`.
 *
 * Renovation: stays a BonusModifier (renovation is single-action, choices
 * are inherently mutually-exclusive per action; the prior shape already
 * matched BGA semantics).
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
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      scope: 'unit',
      from: { wood: 1 },
      to: { clay: 2 },
      conditions: { houseTypeClay: 1 },
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      scope: 'unit',
      from: { wood: 1 },
      to: { stone: 2 },
      conditions: { houseTypeStone: 1 },
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
  ] as (TradeModifier | BonusModifier)[],
})
