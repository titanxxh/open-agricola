import { MinorImprovement } from '../types'

const CARD_ID = 'B72_LoveforAgriculture'

export const B72_LoveforAgriculture = new MinorImprovement({
  id: CARD_ID,
  name: "Love for Agriculture",
  deck: "B",
  number: 72,
  category: "CROP_PROVIDER",
  desc: [
    "You can sow crops in pastures covering 1 or 2 farmyard spaces. If you do, these pastures are also considered fields and hold 1 and 2 animals less, respectively.",
  ],
  cost: {},
})
