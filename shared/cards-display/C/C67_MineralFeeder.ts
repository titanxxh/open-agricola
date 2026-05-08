import { MinorImprovement } from '../types'

const CARD_ID = 'C67_MineralFeeder'

export const C67_MineralFeeder = new MinorImprovement({
  id: CARD_ID,
  name: 'Mineral Feeder',
  deck: 'C',
  number: 67,
  category: 'CROP_PROVIDER',
  desc: ['At the start of each round that does not end with a harvest, if you have at least 1 <SHEEP> in a pasture, you get 1 <GRAIN>.'],
  cost: { reed: 1 },
  vp: 1,
  newSet: true,
})
