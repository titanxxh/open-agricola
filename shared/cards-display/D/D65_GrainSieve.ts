import { MinorImprovement } from '../types'

const CARD_ID = 'D65_GrainSieve'

export const D65_GrainSieve = new MinorImprovement({
  id: CARD_ID,
  name: 'Grain Sieve',
  deck: 'D',
  number: 65,
  category: 'CROP_PROVIDER',
  desc: [
    'In the field phase of each harvest, if you harvest at least 2 <GRAIN>, you get 1 additional <GRAIN> from the general supply.',
  ],
  cost: { wood: 1 },
  implemented: true,
})
