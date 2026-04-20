import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'A10_WoodenShed'

// A10 Wooden Shed: only playable while still in the wooden house; provides room for 1 person.
// BGA additionally restricts play to the Major Improvement action — our model does not track
// the source action space at improvement-play time for minors, so we enforce only the house-type
// and room-capacity aspects here. ("No renovation" is also BGA-specific bookkeeping; the card
// naturally becomes redundant once the house leaves wood.)
registerPrerequisite('Still in Wooden House', (player) => player.houseType === 'wood')

export const A10_WoodenShed = new MinorImprovement({
  id: CARD_ID,
  name: 'Wooden Shed',
  deck: 'A',
  number: 10,
  category: 'FARM_PLANNER',
  desc: ['This card can only be played via a __Major Improvement__ action. It provides room for one person. You may no longer renovate.'],
  cost: { wood: 2, reed: 1 },
  prerequisite: 'Still in Wooden House',
  evenMoreSet: true,
})

export const A10_WoodenShed_impl = {
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: () => 1,
},
  reaches: [] as readonly string[],
} satisfies CardImpl
