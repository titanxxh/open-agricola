import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'
import type { FarmSownEvent } from '../../contract/events'

const CARD_ID = 'D058_Gritter'
const listener: CardListenerRegistration = {
  id: 'D58-gritter-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sowedVegetable = (context.actionEvents ?? context.transactionEvents).some(
      (event) => event.type === 'farm.sown' && (event as Pick<FarmSownEvent, 'sows'>).sows.some((sow) =>
        (sow.location.kind === 'field' || sow.location.kind === 'card') &&
        sow.location.playerId === context.player.id &&
        sow.crop === 'vegetable',
      ),
    )
    if (!sowedVegetable) return
    const n = getLogicalFields(context.player).filter((field) =>
      field.stacks.some((stack) => stack.kind === 'vegetable' && stack.remaining > 0),
    ).length
    if (n === 0) return
    return { flow: gainLeaf(CARD_ID, { food: n }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return state.round >= 5
  },
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D058_Gritter = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Gritter',
    deck: 'D',
    number: 58,
    category: 'FOOD_PROVIDER',
    desc: [
        'At the end of each action in which you sow <VEGETABLE> in a <FIELD>, you get 1 <FOOD> for each <VEGETABLE> <FIELD> you have (including the new ones).',
      ],
    cost: { wood: 1 },
    prerequisite: 'Play in Round 5 or Later',
  },
  impl: cardImpl,
})

export const D058_Gritter_impl = D058_Gritter.impl
