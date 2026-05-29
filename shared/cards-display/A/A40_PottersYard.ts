import { MinorImprovement } from '../types'

const CARD_ID = 'A40_PottersYard'

export const A40_PottersYard = new MinorImprovement({
  id: CARD_ID,
  name: "Potter's Yard",
  deck: 'A',
  number: 40,
  category: 'GOODS_PROVIDER',
  desc: ["Immediately place 1 <CLAY> on each unused space in your farmyard. Each time you turn a space into a used space, you get the clay and you can immediately exchange it for 2 <FOOD>."],
  cost: { wood: 1, reed: 1 },
  prerequisite: 'At Most 7 Unused Farmyard Spaces',
  evenMoreSet: true,
  waresSalesmanGains: [{ clay: 1, reed: 1 }],
})
