import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E36_HerbalGarden'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones) => {
    // At least one pasture must contain no animals.
    // Find the best pasture to block: prefer one that's already empty,
    // otherwise pick the one with the smallest capacity.
    const pastures = zones.filter(z => z.zoneType === 'pasture')
    if (pastures.length === 0) return
    // First try to find an already-empty pasture (animalCount === 0)
    const emptyPasture = pastures.find(p => (p.animalCount ?? 0) === 0)
    if (emptyPasture) {
      emptyPasture.capacity = 0
      return
    }
    // No empty pasture — block the one with smallest capacity
    const sorted = [...pastures].sort((a, b) => a.capacity - b.capacity)
    sorted[0]!.capacity = 0
  },
})

export const E36_HerbalGarden = new MinorImprovement({
  id: CARD_ID,
  name: 'Herbal Garden',
  deck: 'E',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['From now on, at least one of your pastures must contain no animals.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '1 Pasture',
})
