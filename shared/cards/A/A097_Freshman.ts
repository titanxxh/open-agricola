import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'
import { readCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A097_Freshman'
const usedThisTurn = (context: CardListenerContext) => {
  const token = readActionSnapshotToken(context.player)
  return token !== undefined && readCardExtraData<number>(context.player, CARD_ID, 'usedTurnToken') === token
}
const canReplaceBake = (context: CardListenerContext) =>
  !context.actionContext?.checkedReplaceAction &&
  !usedThisTurn(context) &&
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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'usedTurnToken', value: readActionSnapshotToken(context.player) } },
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
