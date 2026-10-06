import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A153_PigOwner'
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
