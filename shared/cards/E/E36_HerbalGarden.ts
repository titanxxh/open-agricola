import { MinorImprovement } from '../types'
// BGA: onBuy triggers forceReorganizeIfNeeded (animal reorg since a pasture must stay empty).
// The pasture restriction is enforced in animal placement logic.
// TODO: implement "one pasture must be empty" animal placement restriction and trigger reorg on buy.

export const E36_HerbalGarden = new MinorImprovement({
  id: 'E36_HerbalGarden',
  name: 'Herbal Garden',
  deck: 'E',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['From now on, at least one of your pastures must contain no animals.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '1 Pasture',
})
