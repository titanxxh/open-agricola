import { Occupation } from '../types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C92_AutumnMother'

export const C92_AutumnMother = new Occupation({
  id: CARD_ID,
  name: "Autumn Mother",
  deck: "C",
  number: 92,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately before each harvest, if you have room in your house, you can take a __Family Growth__ action for 3 <FOOD>."],
  cost: {},
  players: "1+",
})

export const C92_AutumnMother_impl = {
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
        { type: 'leaf', actionId: 'pay-resources', params: { food: 3 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'wish-children-growth', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
