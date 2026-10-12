import { defineOccupationCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { scoringOfferFlow, scoringOfferOption, type ScoringOffer } from '../../actions/plans/scoring-offer'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'

const CARD_ID = 'E132_VeggieLover'
const CHOICE_PREFIX = `${CARD_ID}:pairs:`

const maxScoringPairs = (player: PlayerState) => {
  const reserved = sumSelectedScoringReserve(player)
  return Math.max(0, Math.min(
    3,
    (player.resources.grain ?? 0) - (reserved.grain ?? 0),
    (player.resources.vegetable ?? 0) - (reserved.vegetable ?? 0),
  ))
}

const choiceValue = (pairs: number) => `${CHOICE_PREFIX}${pairs}`

const scoringOffers = (maxCount: number): ScoringOffer[] => Array.from({ length: maxCount + 1 }, (_, pairs) => ({
  value: choiceValue(pairs), kind: 'pay', resources: { grain: pairs, vegetable: pairs }, score: pairs * 2
}))

const cardImpl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1 || player.resources.vegetable < 1) return
      return {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1, vegetable: 1 } }),
          gainLeaf(CARD_ID, { food: 6 }),
        ],
      }
    },
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state, player) => {
      const maxPairs = maxScoringPairs(player)
      if (maxPairs <= 0) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          promptKey: 'ui.cards.E132_VeggieLover.prompt',
          options: scoringOffers(maxPairs).map(offer => scoringOfferOption(CARD_ID, offer)),
        },
      } satisfies ActionFlow
    },
    resolveChoice: (_state, player, choice) => {
      const offer = scoringOffers(maxScoringPairs(player)).find(candidate => candidate.value === choice)
      return offer ? scoringOfferFlow(CARD_ID, offer) : undefined
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E132_VeggieLover = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Veggie Lover",
    deck: "E",
    number: 132,
    category: "BONUS_POINTS",
    desc: [
        '[Harvest]',
        '<GRAIN_VEG_STACK> <ARROW-1X> 6<FOOD>',
        '[Scoring]',
        '1/2/3 <GRAIN_VEG_STACK> <ARROW-1X> 2/4/6 <SCORE>',
      ],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E132_VeggieLover_impl = E132_VeggieLover.impl
