import { Occupation } from '../types'

const CARD_ID = 'D141_SeedSeller'

export const D141_SeedSeller = new Occupation({
  id: CARD_ID,
  name: "Seed Seller",
  deck: "D",
  number: 141,
  category: "CROP_PROVIDER",
  desc: [
    "When you play this card, you immediately get 1 <GRAIN>. Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN>.",
  ],
  cost: {},
  players: "3+",
})
