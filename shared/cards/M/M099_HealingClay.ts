import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M099_HealingClay'

const usedSickWorker = (context: CardListenerContext): boolean => {
  const player = context.ownerPlayer ?? context.player
  const sick = new Set(player.sickWorkerIds ?? [])
  return (context.space?.takenBy ?? []).some((worker) =>
    worker.playerId === player.id && sick.has(worker.workerId),
  )
}

const listener: CardListenerRegistration = {
  id: 'M099-healing-clay-after-infirmary',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'moor-infirmary' || !usedSickWorker(context)) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M099_HealingClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Healing Clay",
    deck: "M",
    number: 99,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 food. Each time you use the \"Infirmary\" action space with a person lying in bed, you get 1 additional food."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M099_HealingClay_impl = M099_HealingClay.impl
