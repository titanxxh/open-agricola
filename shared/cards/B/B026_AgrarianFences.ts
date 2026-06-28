import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import { collectComputeCostsForFarmChoice } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'B026_AgrarianFences'
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

const computeReplaceBakeListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-replace-bake-on-grain-utilization',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
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
          // Option: bake-bread + build fences
          {
            type: 'seq',
            choiceLabelKey: 'ui.interactionAgrarianFencesBakeAndFence',
            children: [
              { type: 'leaf', actionId: 'bake-bread', sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID },
            ],
          },
        ],
      },
    }
  },
}

const previewFenceCostOverride = (context: CardListenerContext) =>
  collectComputeCostsForFarmChoice(context.state, context.player, 'fence', {})

const isDoableListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    if (context.doable) return
    // Make sow doable if fencing is possible (the card adds fence as an alternative)
    if (canStartFencing(context.state, context.player, previewFenceCostOverride(context))) {
      return { doable: true }
    }
  },
}

const isDoableBakeListener: CardListenerRegistration = {
  id: 'B26-agrarian-fences-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-utilization') return
    if (context.doable) return
    if (canStartFencing(context.state, context.player, previewFenceCostOverride(context))) {
      return { doable: true }
    }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener, computeReplaceBakeListener, isDoableListener, isDoableBakeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B026_AgrarianFences = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Agrarian Fences',
    deck: 'B',
    number: 26,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time you use the __Grain Utilization__ action space, you can take a __Build Fences__ action instead of one of the two actions provide by the action space.',
      ],
  },
  impl: cardImpl,
})

export const B026_AgrarianFences_impl = B026_AgrarianFences.impl
