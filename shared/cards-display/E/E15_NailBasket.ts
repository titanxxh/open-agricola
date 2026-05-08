import { MinorImprovement } from '../types'

const CARD_ID = 'E15_NailBasket'

export const E15_NailBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Nail Basket',
  deck: 'E',
  number: 15,
  category: 'FARMYARD_-__FENCING_OR_STABLE_BUILDING',
  desc: [
    'Each time after you use a wood accumulation space, you can place 1\u00a0<STONE> from your supply on that space (for the next visitor) to take a __Build Fences__ action.',
  ],
  cost: { reed: 1 },
  vp: 1,
})
