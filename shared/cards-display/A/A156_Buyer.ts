import { Occupation } from '../types'

const CARD_ID = 'A156_Buyer'

export const A156_Buyer = new Occupation({
  id: CARD_ID,
  name: "Buyer",
  deck: "A",
  number: 156,
  category: "GOODS_PROVIDER",
  desc: [
    "Each time another player uses a reed, stone, sheep, or wild boar accumulation space, you can pay them 1 <FOOD> to get 1 good of the respective type from the general supply.",
  ],
  cost: {},
  players: "4+",
})
