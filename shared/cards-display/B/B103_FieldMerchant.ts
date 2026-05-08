import { Occupation } from '../types'

const CARD_ID = 'B103_FieldMerchant'

export const B103_FieldMerchant = new Occupation({
  id: CARD_ID,
  name: "Field Merchant",
  deck: "B",
  number: 103,
  category: "GOODS_PROVIDER",
  desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <REED>. Each time you decline a __Minor/Major Improvement__ action, you get 1 <FOOD>/<VEGETABLE> instead."],
  cost: {},
  players: "1+",
})
