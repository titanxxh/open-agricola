import { MinorImprovement } from '../types'

const CARD_ID = 'B9_BeatingRod'

export const B9_BeatingRod = new MinorImprovement({
  id: CARD_ID,
  name: "Beating Rod",
  deck: "B",
  number: 9,
  category: "GOODS_PROVIDER",
  desc: ["You can immediately choose to either get 1 <REED> or exchange 1 <REED> for 1 <CATTLE>."],
  passing: true,
})
