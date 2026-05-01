import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getTotalAnimalCapacity } from '../../actions/effects/animals'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D167_PureBreeder'
const harvestRounds = [4, 7, 9, 11, 13, 14]
const BREEDABLE = ['sheep', 'boar', 'cattle'] as const

export const D167_PureBreeder = new Occupation({
  id: "D167_PureBreeder",
  name: "Pure Breeder",
  deck: "D",
  number: 167,
  category: "LIVESTOCK_PROVIDER",
  desc: ["You immediately get 1 <WOOD>. After each round that does not end with a harvest, you can breed exactly one type of animal. (This is not considered a breeding phase.)"],
  cost: {},
  players: "4+",
  newSet: true,
})

export const D167_PureBreeder_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onAfterRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return // harvest round — skip
    const totalAnimals = BREEDABLE.reduce((sum, t) => sum + player.resources[t], 0)
    const cap = getTotalAnimalCapacity(player)
    if (totalAnimals >= cap) return // no capacity for new animal
    const children: ActionFlow[] = BREEDABLE
      .filter((t) => player.resources[t] >= 2)
      .map((t) => ({
        type: 'leaf' as const,
        actionId: 'gain',
        params: { [t]: 1 },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionBreed',
        choiceLabelParams: { animal: t },
      }))
    if (children.length === 0) return
    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
