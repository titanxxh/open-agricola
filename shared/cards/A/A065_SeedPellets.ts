import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canSow, isUnconditionalSow } from '../../actions/effects/sow'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A065_SeedPellets'
const beforeSowListener: CardListenerRegistration = {
  id: 'A65-seed-pellets-before-sow',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
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
    if (!isUnconditionalSow(context.actionContext)) return
    if (canSow(context.player)) return
    if (!context.player.fields.some((field) => fieldIsEmpty(field))) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeSowListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A065_SeedPellets = defineMinorCard({
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

export const A065_SeedPellets_impl = A065_SeedPellets.impl
