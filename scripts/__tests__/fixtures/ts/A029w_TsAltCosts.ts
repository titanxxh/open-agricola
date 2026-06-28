import { MinorImprovement } from '../../../../shared/cards-display/types'

const CARD_ID = 'A029w_TsAltCosts'

export const A029w_TsAltCosts = new MinorImprovement({
  id: CARD_ID,
  name: 'TS AltCosts',
  deck: 'A',
  number: 29,
  desc: ['placeholder'],
  altCosts: [{wood: 1}, {food: 2}],
})
