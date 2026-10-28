import { getPlacedAnimalsByType } from '../../domain/animal-zones'
import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A153_PigOwner'

const anytimeListener: CardListenerRegistration = {
  id: 'A153-pig-owner-anytime',
  cardIds: [CARD_ID],
  actions: ['anytime'],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (getPlacedAnimalsByType(context.player, context.state).boar < 5) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A153_PigOwner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pig Owner',
    deck: 'A',
    number: 153,
    category: 'POINTS_PROVIDER',
    desc: ['The first time after you play this card that you have 5 <PIG> on your farm, you immediately get 3 bonus <SCORE>.'],
    cost: {},
    players: '4+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const A153_PigOwner_impl = A153_PigOwner.impl
