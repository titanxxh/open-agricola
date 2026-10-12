import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { ActionFlow, PlayerState, Resource } from '../../contract/types'
import { scoringOfferFlow, scoringOfferOption, type ScoringOffer } from '../../actions/plans/scoring-offer'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'

const CARD_ID = 'C133_Soldier'
const CHOICE_PREFIX = `${CARD_ID}:pairs:`

const maxSoldierPairs = (player: PlayerState) => {
  const reserved = sumSelectedScoringReserve(player, { excludeCardId: CARD_ID })
  return Math.max(0, Math.min(
    (player.resources.wood ?? 0) - (reserved.wood ?? 0),
    (player.resources.stone ?? 0) - (reserved.stone ?? 0),
  ))
}

const choiceValue = (pairs: number) => `${CHOICE_PREFIX}${pairs}`

const reserveForPairs = (pairs: number): Partial<Resource> => ({
  wood: pairs,
  stone: pairs,
})

const scoringOffers = (maxCount: number): ScoringOffer[] => Array.from({ length: maxCount + 1 }, (_, pairs) => ({
  value: choiceValue(pairs), kind: 'reserve', resources: reserveForPairs(pairs), score: pairs, cardType: 'occupation'
}))

const cardImpl = {
  effect: {
    id: CARD_ID,
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state, player) => {
      const maxPairs = maxSoldierPairs(player)
      if (maxPairs <= 0) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          promptKey: 'ui.cards.C133_Soldier.prompt',
          options: scoringOffers(maxPairs).map(offer => scoringOfferOption(CARD_ID, offer)),
        },
      } satisfies ActionFlow
    },
    resolveChoice: (_state, player, choice) => {
      const offer = scoringOffers(maxSoldierPairs(player)).find(candidate => candidate.value === choice)
      return offer ? scoringOfferFlow(CARD_ID, offer) : undefined
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C133_Soldier = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Soldier",
    deck: "C",
    number: 133,
    category: "POINTS_PROVIDER",
    desc: ["During scoring, you get 1 bonus <SCORE> for each <STONE> + <WOOD> pair in your supply. You cannot score additional points for the resources scored with this card."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C133_Soldier_impl = C133_Soldier.impl
