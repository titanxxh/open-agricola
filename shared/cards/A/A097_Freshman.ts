import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'
import type { CardImpl } from '../registry'
import { isUsedThisTurnOrGap, markUsedThisTurnOrGapLeaf } from '../helpers/turn-token'

const CARD_ID = 'A097_Freshman'
const canReplaceBake = (context: CardListenerContext) =>
  !context.actionContext?.checkedReplaceAction &&
  !isUsedThisTurnOrGap(context.player, CARD_ID, context.turnScopeProjection) &&
  hasPlayableOccupationChoice(context.state, context.player, context.space.id, { exactCost: {} }, context?.actionHooks)
const computeReplaceListener: CardListenerRegistration = {
  id: 'A97-freshman-replace-bake',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canReplaceBake(context)) return
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        promptKey: 'ui.interactionFreshmanOccupation',
        children: [
          markUsedThisTurnOrGapLeaf(context.player, CARD_ID),
          {
            type: 'leaf',
            actionId: 'occupation',
            sourceCard: CARD_ID,
            params: { exactCost: {} },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableBakeListener: CardListenerRegistration = {
  id: 'A97-freshman-isdoable-bake',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['bake-bread'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!canReplaceBake(context)) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener, isDoableBakeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A097_Freshman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Freshman",
    deck: "A",
    number: 97,
    category: "ACTIONS_BOOSTER",
    desc: ["Each time you get a __Bake Bread__ action, instead of taking the action, you can play an occupation without paying an occupation cost (at most once per turn)."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A097_Freshman_impl = A097_Freshman.impl
