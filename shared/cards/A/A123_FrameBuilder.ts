import { Occupation } from '../types'
import type { TradeModifier } from '../../game/types'

const CARD_ID = 'A123_FrameBuilder'

export const A123_FrameBuilder = new Occupation({
  id: CARD_ID,
  name: "Frame Builder",
  deck: "A",
  number: 123,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>."],
  cost: {},
  players: "1+",
  modifiers: [
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      from: { wood: 1 },
      to: { clay: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      from: { wood: 1 },
      to: { stone: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      from: { wood: 1 },
      to: { clay: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      from: { wood: 1 },
      to: { stone: 2 },
      max: 1,
    },
  ] as TradeModifier[],
})
