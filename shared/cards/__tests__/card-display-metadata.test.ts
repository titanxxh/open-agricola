import { describe, expect, it } from 'vitest'
import { MinorImprovement } from '../../cards-display/types'

describe('card display metadata serialization', () => {
  it('preserves card capability metadata in CardBase.toJSON', () => {
    const card = new MinorImprovement({
      id: '__TEST_MetadataCard',
      name: 'Metadata Card',
      deck: 'test',
      number: 1,
      desc: [],
      preventsHandDiscard: true,
      animalHolder: true,
      blocksHouseAnimalZones: true,
      cookingHearthIdentity: true,
      ovenIdentity: true,
      potteryIdentity: true,
      waresSalesmanGains: [{ wood: 1, reed: 1 }],
    })

    expect(card.toJSON()).toMatchObject({
      preventsHandDiscard: true,
      animalHolder: true,
      blocksHouseAnimalZones: true,
      cookingHearthIdentity: true,
      ovenIdentity: true,
      potteryIdentity: true,
      waresSalesmanGains: [{ wood: 1, reed: 1 }],
    })
  })
})
