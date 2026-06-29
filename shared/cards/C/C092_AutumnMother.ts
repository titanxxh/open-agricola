import { defineOccupationCard } from '../card-source'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C092_AutumnMother'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (_state, player) => {
    // Only offer if player has room in house
    if (player.rooms <= familySize(player)) return
    if (player.resources.food < 3) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { food: 3 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C092_AutumnMother = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Autumn Mother",
    deck: "C",
    number: 92,
    category: "ACTIONS_BOOSTER",
    desc: ["Immediately before each harvest, if you have room in your house, you can take a __Family Growth__ action for 3 <FOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const C092_AutumnMother_impl = C092_AutumnMother.impl
