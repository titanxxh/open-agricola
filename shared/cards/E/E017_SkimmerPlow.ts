import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import type { FarmSownEvent } from '../../contract/events'
import { deriveVirtualTileCol } from '../helpers/card-field'

const CARD_ID = 'E017_SkimmerPlow'
const listener: CardListenerRegistration = {
  id: 'E17-skimmer-plow-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'farmland' && spaceId !== 'cultivation') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const reduceSownCropsListener: CardListenerRegistration = {
  id: 'E17-skimmer-plow-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sows = (context.actionEvents ?? context.transactionEvents).flatMap((event) =>
      event.type === 'farm.sown' ? (event as Pick<FarmSownEvent, 'sows'>).sows : [],
    ).filter((sow): sow is typeof sow & {
      location:
        | { kind: 'field'; playerId: string; row: number; col: number }
        | { kind: 'card'; playerId?: string; cardId: string }
    } =>
      (sow.location.kind === 'field' || sow.location.kind === 'card') &&
      sow.location.playerId === context.player.id,
    )
    if (sows.length === 0) return
    return {
      flow: {
        type: 'seq',
        children: sows.map((sow) => ({
          type: 'leaf' as const,
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'remove-field-crops',
            crop: sow.crop,
            positions: [sow.location.kind === 'field'
              ? { row: sow.location.row, col: sow.location.col }
              : { row: -1, col: deriveVirtualTileCol(sow.location.cardId, 0) }],
          },
        })),
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener, reduceSownCropsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E017_SkimmerPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Skimmer Plow',
    deck: 'E',
    number: 17,
    category: 'FARMYARD_-_PLOWING',
    desc: ['Each time you use the __Farmland__ or __Cultivation__  action space, you can plow 2 <FIELD> instead of 1. Each time you sow, you must place 1 fewer good on each <FIELD> you sow.'],
    cost: { wood: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const E017_SkimmerPlow_impl = E017_SkimmerPlow.impl
