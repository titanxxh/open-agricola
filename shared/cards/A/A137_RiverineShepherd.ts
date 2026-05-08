import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A137_RiverineShepherd'

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
 * Implementation note: We give from general supply (consistent with A82_WorkCertificate
 * pattern) but check the other space's accumulated resources as a condition for
 * whether the option is offered.
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
        children: [gainLeaf(CARD_ID, { [resourceType]: 1 })],
      } as ActionFlow,
      sourceCard: CARD_ID,
    }
  },
}

export const A137_RiverineShepherd = new Occupation({
  id: CARD_ID,
  name: "Riverine Shepherd",
  deck: "A",
  number: 137,
  category: "GOODS_PROVIDER",
  desc: ["Each time you use the __Sheep Market__ or __Reed Bank__ accumulation space, you can also take 1 good from the respective other accumulation space, if possible."],
  cost: {},
  players: "3+",
  newSet: true,
})

export const A137_RiverineShepherd_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
