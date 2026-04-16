import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E142_Smuggler'

registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

    // Can exchange up to 2 goods: WOOD→GRAIN or GRAIN→STONE (or both once each)
    const canWood2 = player.resources.wood >= 2
    const canGrain2 = player.resources.grain >= 2
    const canWood1 = player.resources.wood >= 1
    const canGrain1 = player.resources.grain >= 1

    const singleOptions: ActionFlow[] = []
    if (canWood1) {
      singleOptions.push({
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { wood: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { grain: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { wood: 1 }, resourcesGained: { grain: 1 } },
      })
    }
    if (canGrain1) {
      singleOptions.push({
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 1 }, resourcesGained: { stone: 1 } },
      })
    }

    const children: ActionFlow[] = []

    // 2x options (both same type)
    if (canWood2) {
      children.push({
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { wood: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { grain: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { wood: 2 }, resourcesGained: { grain: 2 } },
      })
    }
    if (canGrain2) {
      children.push({
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 2 }, resourcesGained: { stone: 2 } },
      })
    }

    // Mixed 1+1 option (wood→grain AND grain→stone using an OR node)
    if (singleOptions.length > 0) {
      children.push({
        type: 'or',
        optional: true,
        children: singleOptions,
      })
    }

    if (children.length === 0) return

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
})

export const E142_Smuggler = new Occupation({
  id: CARD_ID,
  name: "Smuggler",
  deck: "E",
  number: 142,
  category: "GOODS_PROVIDER",
  desc: [
    'In the feeding phase of each harvest, you can exchange up to 2 goods as follows:',
    '[<WOOD> <ARROW> <GRAIN>]',
    'or',
    '[<GRAIN> <ARROW> <STONE>]',
  ],
  cost: {},
  players: "3+",
})
