import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D129_LumberVirtuoso } from '../../cards-display/D/D129_LumberVirtuoso'
export { D129_LumberVirtuoso }

const CARD_ID = D129_LumberVirtuoso.id

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
