import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing } from '../../actions/effects/fencing'

const CARD_ID = 'B26_AgrarianFences'

/**
 * B26 Agrarian Fences — Minor Improvement
 *
 * When you use the Grain Utilization action space, you can also/instead
 * build fences.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — replaces grain-utilization flow
 * to offer XOR: (1) normal sow+bake, (2) build fences, (3) sow+fences.
 *
 * Implementation: computeReplace on 'sow' within grain-utilization context.
 * The grain-utilization flow is or(sow, bake-bread). By replacing 'sow'
 * with an XOR(fence, seq(sow, fence)), the overall flow becomes:
 *   or(xor(fence, seq(sow, fence), sow), bake-bread)
 * This gives the player all desired options:
 *   - sow + optional bake (normal behavior, pick sow from xor + bake from or)
 *   - fence + optional bake (pick fence from xor + bake from or)
 *   - sow + fence + optional bake (pick sow+fence from xor + bake from or)
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-replace-sow-on-grain-utilization',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // Only apply within the grain-utilization action space
    if (context.space?.id !== 'grain-utilization') return
    // Don't recurse into already-replaced actions
    if (context.actionContext?.checkedReplaceAction) return

    return {
      decline: true,
      alternativeFlow: {
        type: 'xor',
        children: [
          // Option: build fences only
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
            choiceLabelKey: 'actions.fencing.name',
          },
          // Option: sow + build fences
          {
            type: 'seq',
            choiceLabelKey: 'ui.interactionAgrarianFencesSowAndFence',
            children: [
              { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID },
            ],
          },
        ],
      },
    }
  },
}

// Also make the sow action doable within grain-utilization when the player
// can build fences (since the card adds fencing as an alternative)
const isDoableListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.space?.id !== 'grain-utilization') return
    if (context.doable) return
    // Make sow doable if fencing is possible (the card adds fence as an alternative)
    if (canStartFencing(context.player)) {
      return { doable: true }
    }
  },
}

registerCardListener(computeReplaceListener)
registerCardListener(isDoableListener)

export const B26_AgrarianFences = new MinorImprovement({
  id: CARD_ID,
  name: 'Agrarian Fences',
  deck: 'B',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time you use the __Grain Utilization__ action space, you can take a __Build Fences__ action instead of one of the two actions provide by the action space.',
  ],
  cost: { wood: 1 },
})
