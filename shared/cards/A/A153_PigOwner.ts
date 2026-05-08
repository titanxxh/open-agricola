import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A153_PigOwner } from '../../cards-display/A/A153_PigOwner'

const CARD_ID = A153_PigOwner.id

const countPigsOnFarm = (player: CardListenerContext['player']): number => {
  let count = 0
  for (const pasture of player.pastures) {
    if (pasture.animalType === 'boar') count += pasture.animalCount ?? 0
  }
  if (player.houseAnimalType === 'boar') count += player.houseAnimalCount ?? 0
  for (const animal of Object.values(player.stableAnimals ?? {})) {
    if (animal === 'boar') count++
  }
  return count
}

const anytimeListener: CardListenerRegistration = {
  id: 'A153-pig-owner-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (countPigsOnFarm(context.player) < 5) return
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
      labelKey: 'cards.A153_PigOwner.anytime',
    }
  },
}

export const A153_PigOwner_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
