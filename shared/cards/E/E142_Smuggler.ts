import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E142_Smuggler } from '../../cards-display/E/E142_Smuggler'
export { E142_Smuggler }

const CARD_ID = E142_Smuggler.id

export const E142_Smuggler_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {

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
          { type: 'leaf', actionId: 'pay', params: { wood: 1 }, sourceCard: CARD_ID },
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
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
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
          { type: 'leaf', actionId: 'pay', params: { wood: 2 }, sourceCard: CARD_ID },
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
          { type: 'leaf', actionId: 'pay', params: { grain: 2 }, sourceCard: CARD_ID },
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
