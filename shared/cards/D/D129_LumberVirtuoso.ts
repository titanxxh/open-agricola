import { Occupation } from '../types'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D129_LumberVirtuoso'

export const D129_LumberVirtuoso = new Occupation({
  id: CARD_ID,
  name: 'Lumber Virtuoso',
  deck: 'D',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each harvest in which you have at least 5 <WOOD> in your supply, you can discard down to 5 <WOOD> to take a __Build Stables__ or __Build Wood Rooms__ action by paying the usual costs.',
  ],
  cost: {},
  players: '3+',
})

export const D129_LumberVirtuoso_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {
    if (player.resources.wood < 5) return

    const excessWood = player.resources.wood - 5

    const options: ActionFlow[] = []

    // Option 1: Build stables (always available)
    const stablesFlow: ActionFlow = excessWood > 0
      ? {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', sourceCard: CARD_ID, params: { wood: excessWood } },
            { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID },
          ],
        }
      : { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID }
    options.push(stablesFlow)

    // Option 2: Build rooms (only for wood houses)
    if (player.houseType === 'wood') {
      const roomFlow: ActionFlow = excessWood > 0
        ? {
            type: 'seq',
            children: [
              { type: 'leaf', actionId: 'pay', sourceCard: CARD_ID, params: { wood: excessWood } },
              { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
            ],
          }
        : { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID }
      options.push(roomFlow)
    }

    if (options.length === 0) return

    const choice: ActionFlow = options.length === 1
      ? { ...options[0]!, optional: true } as ActionFlow
      : { type: 'xor', optional: true, children: options }

    return choice
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
