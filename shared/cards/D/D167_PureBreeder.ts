import { gainLeaf } from '../helpers/pay-gain-node'
import { playerBoard } from '../../domain'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D167_PureBreeder } from '../../cards-display/D/D167_PureBreeder'

const CARD_ID = 'D167_PureBreeder'

const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE = ['sheep', 'boar', 'cattle'] as const

export const D167_PureBreeder_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onAfterRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return // harvest round — skip
    const totalAnimals = BREEDABLE.reduce((sum, t) => sum + player.resources[t], 0)
    const idx = state.players.indexOf(player)
    const cap = playerBoard(state, idx).animals.totalCapacity()
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
