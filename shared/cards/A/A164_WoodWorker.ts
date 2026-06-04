import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A164_WoodWorker'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A164-wood-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { sheep: 1 },
      choiceLabelKey: 'occupations.A164_WoodWorker.name',
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A164_WoodWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Worker',
    deck: 'A',
    number: 164,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you take <WOOD> from an accumulation space, you can exchange 1 <WOOD> for 1 <SHEEP>. Place the <WOOD> on the accumulation space.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A164_WoodWorker_impl = A164_WoodWorker.impl
