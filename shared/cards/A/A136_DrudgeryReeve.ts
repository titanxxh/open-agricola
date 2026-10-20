import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { PlayerState, Resource } from '../../contract/types'
import { scoringOfferChoice, type ScoringOffer } from '../../actions/plans/scoring-offer'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'

const CARD_ID = 'A136_DrudgeryReeve'
const WOOD_BY_REMAINING: number[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4]

const BONUS_BY_SETS: number[] = [0, 1, 3, 5]
const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const
const CHOICE_PREFIX = `${CARD_ID}:sets:`

const maxScoringSets = (player: PlayerState) => {
  const reserved = sumSelectedScoringReserve(player, { excludeCardId: CARD_ID })
  return Math.max(0, Math.min(
    3,
    ...BUILDING_RESOURCES.map((resource) =>
      (player.resources[resource] ?? 0) - (reserved[resource] ?? 0),
    ),
  ))
}

const choiceValue = (sets: number) => `${CHOICE_PREFIX}${sets}`

const reserveForSets = (sets: number): Partial<Resource> => ({
  wood: sets,
  clay: sets,
  reed: sets,
  stone: sets,
})

const scoringOffers = (maxCount: number): ScoringOffer[] => Array.from({ length: maxCount + 1 }, (_, sets) => ({
  value: choiceValue(sets), kind: 'reserve', resources: reserveForSets(sets), score: BONUS_BY_SETS[sets] ?? 0, cardType: 'occupation'
}))
const scoringChoice = scoringOfferChoice(CARD_ID, player => scoringOffers(maxScoringSets(player)))

const cardImpl = {
  effect: {
    id: CARD_ID,
    beforeEndGameScope: 'allPlayers',
    beforeEndGameMandatory: true,
    onBuy: (state, _player) => {
      const remainingTurns = 14 - state.round
      const wood = WOOD_BY_REMAINING[remainingTurns] ?? (remainingTurns >= 9 ? 4 : 0)
      if (wood > 0) {
        return gainLeaf(CARD_ID, { wood })
      }
    },
    onBeforeEndGame: (_state, player) => {
      if (maxScoringSets(player) <= 0) return
      return scoringChoice.promptLeaf(player, 'ui.cards.A136_DrudgeryReeve.prompt')
    },
    resolveChoice: scoringChoice.resolveChoice,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A136_DrudgeryReeve = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Drudgery Reeve",
    deck: "A",
    number: 136,
    category: "POINTS_PROVIDER",
    desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A136_DrudgeryReeve_impl = A136_DrudgeryReeve.impl
