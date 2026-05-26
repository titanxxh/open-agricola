import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { createPartialTakeFromSpaceLeaf } from '../helpers/partial-take'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A137_RiverineShepherd } from '../../cards-display/A/A137_RiverineShepherd'

const CARD_ID = A137_RiverineShepherd.id

/**
 * A137 Riverine Shepherd:
 * Each time you use the Sheep Market or Reed Bank accumulation space,
 * you can also take 1 good from the respective other accumulation space, if possible.
 *
 * - Use Sheep Market → optionally take 1 reed (if Reed Bank has accumulated reed)
 * - Use Reed Bank → optionally take 1 sheep (if Sheep Market has accumulated sheep)
 *
 * BGA reference: A_137_RiverineShepherd.php — checks the OTHER space's accumulated
 * resources. If the other space has resources of the matching type, the player may
 * optionally take 1.
 *
 * Implementation note: The optional good is collected from the other action space,
 * preserving action-space provenance for listeners that care about the source.
 */
const listener: CardListenerRegistration = {
  id: 'A137-riverine-shepherd-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space) return

    const spaceId = context.space.id
    let otherSpaceId: string
    let resourceType: 'reed' | 'sheep'

    if (spaceId === 'sheep-market') {
      otherSpaceId = 'reed-bank'
      resourceType = 'reed'
    } else if (spaceId === 'reed-bank') {
      otherSpaceId = 'sheep-market'
      resourceType = 'sheep'
    } else {
      return
    }

    // Check if the other space has accumulated resources
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace || (otherSpace.resources[resourceType] ?? 0) <= 0) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          createPartialTakeFromSpaceLeaf({
            sourceCard: CARD_ID,
            spaceId: otherSpace.id,
            spaceName: otherSpace.nameKey,
            resource: resourceType,
            includeEffectPreview: true,
          }),
        ],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

export const A137_RiverineShepherd_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
