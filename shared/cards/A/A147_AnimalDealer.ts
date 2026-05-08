import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A147_AnimalDealer } from '../../cards-display/A/A147_AnimalDealer'
export { A147_AnimalDealer }

const CARD_ID = A147_AnimalDealer.id

type AnimalKey = 'sheep' | 'boar' | 'cattle'

const SPACE_TO_ANIMAL: Record<string, AnimalKey> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

const listener: CardListenerRegistration = {
  id: 'A147-animal-dealer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id ?? ''
    const animal = SPACE_TO_ANIMAL[spaceId]
    if (!animal) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          gainLeaf(CARD_ID, { [animal]: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A147_AnimalDealer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
