import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'D129_LumberVirtuoso'

/**
 * D129 Lumber Virtuoso — Each harvest in which you have at least 5 wood in
 * your supply, you can discard down to 5 wood to take a Build Stables or
 * Build Wood Rooms action by paying the usual costs.
 *
 * Implementation: onStartHarvest returns an optional flow when wood >= 5.
 * The flow pays excess wood (wood - 5), then offers XOR of stables / construct.
 * Both sub-actions handle their own usual costs.
 */
registerCardEffect({
  id: CARD_ID,
  onStartHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.resources.wood < 5) return

    const excessWood = player.resources.wood - 5

    const options: ActionFlow[] = []

    // Option 1: Build stables (always available)
    const stablesFlow: ActionFlow = excessWood > 0
      ? {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay-resources', sourceCard: CARD_ID, params: { wood: excessWood } },
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
              { type: 'leaf', actionId: 'pay-resources', sourceCard: CARD_ID, params: { wood: excessWood } },
              { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID },
            ],
          }
        : { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID }
      options.push(roomFlow)
    }

    if (options.length === 0) return

    const choice: ActionFlow = options.length === 1
      ? { ...options[0]!, optional: true }
      : { type: 'xor', optional: true, children: options }

    return choice
  },
})

export const D129_LumberVirtuoso = new Occupation({
  id: CARD_ID,
  name: 'Lumber Virtuoso',
  deck: 'D',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each harvest in which you have at least 5 <WOOD>, you can discard down to 5 <WOOD> to take a Build Stables or Build Wood Rooms action by paying the usual costs.'],
  cost: {},
  players: '3+',
})
