import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canSow } from '../../actions/effects/sow'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A65_SeedPellets'
const isUnconditionalSow = (context: CardListenerContext) => {
  const actionContext = context.actionContext ?? {}
  if (actionContext.checkedReplaceAction === true) return false
  return actionContext.maxSelections === undefined && actionContext.cropType === undefined
}

const beforeSowListener: CardListenerRegistration = {
  id: 'A65-seed-pellets-before-sow',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context)) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'A65-seed-pellets-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (!isUnconditionalSow(context)) return
    if (canSow(context.player)) return
    if (!context.player.fields.some((field) => fieldIsEmpty(field))) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeSowListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A65_SeedPellets = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Seed Pellets",
    deck: "A",
    number: 65,
    category: "CROP_PROVIDER",
    desc: ["Each time before you take an unconditional __Sow__ action, you get 1 <GRAIN>."],
    cost: {},
    prerequisite: "3 Fields",
  },
  impl: cardImpl,
})

export const A65_SeedPellets_impl = A65_SeedPellets.impl
