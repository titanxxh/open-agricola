import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B7_Wage } from '../../cards-display/B/B7_Wage'
export { B7_Wage }

const CARD_ID = B7_Wage.id

const BOTTOM_ROW_MAJORS = ['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']

export const B7_Wage_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const bonus = player.improvements.filter((id) => BOTTOM_ROW_MAJORS.includes(id)).length
    return gainLeaf(CARD_ID, { food: 2 + bonus })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
